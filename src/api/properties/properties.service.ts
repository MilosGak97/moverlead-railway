import {
    BadRequestException, ConflictException, ForbiddenException,
    forwardRef,
    HttpException,
    HttpStatus,
    Inject,
    Injectable, InternalServerErrorException, Logger, NotFoundException, Post,
    StreamableFile,
} from "@nestjs/common";
import {PropertyRepository} from "../../repositories/property.repository";
import {UserRepository} from "../../repositories/user.repository";
import {StateResponseDto} from "./dto/state-response.dto";
import {HttpService} from "@nestjs/axios";
import {GetProductsDto} from "./dto/get-products-dto";
import {CountyRepository} from "../../repositories/county.repository";
import {StripeService} from "../stripe/stripe.service";
import {User} from "../../entities/user.entity";
import {GetSubscriptionsDto} from "./dto/get-subscriptions.dto";
import {GetSubscriptionsResponseDto} from "./dto/get-subscriptions-response.dto";
import Stripe from "stripe";
import {SubscriptionItemsDto} from "./dto/subscription-items.dto";
import {statesArray} from "./dto/states.array"; // Correct ESModule-style import
import {CreatePropertyDto} from "./dto/create-property.dto";
import {County} from "src/entities/county.entity";
import { In, IsNull, Not} from "typeorm";
import {Property} from "../../entities/property.entity";
import {ScrapperService} from "../scrapper/scrapper.service";
import {FillBrightdataDto} from "../scrapper/dto/fill-brightdata-dto";
import {ListingsExportDto} from "./dto/listings-export.dto";
import axios from "axios";
import {BrightdataVersion} from "../../enums/brightdata-version.enum";
import {PropertyListingRepository} from "../../repositories/property-listing.repository";
import {PropertyHomeownerEnrichmentRepository} from "../../repositories/property-homeowner-enrichment.repository";
import {UserPropertyFilteringRepository} from "../../repositories/user-property-filtering.repository";
import {UserVisibleListingRepository} from "../../repositories/user-visible-listing.repository";
import {PropertyStatus} from "../../enums/property-status.enum";
import {UserExtrasAccessRepository} from "../../repositories/user-extras-access.repository";
import {UserExtrasAccessType} from "../../enums/user-extras-access-type.enum";
import {GetListingsDto} from "./dto/get-listings.dto";
import {GetListingsResponseDto} from "./dto/get-listings.response.dto";
import {GetListingObjectDto} from "./dto/get-listing.object.dto";
import {UserPropertyFiltering} from "../../entities/user-property-filtering.entity";
import {stringify} from 'csv-stringify/sync';
import {FilteringResponseDto} from "./dto/filtering-response.dto";
import {FilteringObjectDto} from "./dto/filtering-object.dto";
import {FilteringActionDto} from "./dto/filtering-action.dto";
import {MessageResponseDto} from "../../dto/message-response.dto";
import {UserSubscriptionRepository} from "../../repositories/user-subscription.repository";
import {PropertyListing} from "../../entities/property-listing.entity";
import {UserTokenService} from "../user-token/user-token.service";
import {PropertyHomeownerEnrichment} from "../../entities/property-homeowner-enrichment.entity";
import {UserExtrasAccess} from "../../entities/user-extras-access.entity";
import {UserVisibleListing} from "../../entities/user-visible-listing.entity";
import {AiService} from "../ai/ai.service";
import {PropertyAiFilteringRepository} from "../../repositories/property-ai-filtering.repository";
import {PropertyAiFiltering} from "../../entities/property-ai-filtering.entity";
import {AiFilteringJobStatus} from "../../enums/ai-filtering-job-status.enum";
import {Queue} from "bull";
import {InjectQueue} from "@nestjs/bull";
import { parse } from 'csv-parse/sync';
import {DealmachineRepository} from "../../repositories/dealmachine.repository";
import {runNodeScript} from "../../puppeteer/run-node-script";
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { pipeline } from 'node:stream/promises';
import {createWriteStream} from "node:fs";
import {GmailService} from "../gmail/gmail.service";
// @ts-ignore
import { parse as json2csvParse } from 'json2csv';
import { chromium } from 'playwright-core';
import {runNodePlaywright} from "../../puppeteer/run-node-playwright";
import {NodeSSH} from "node-ssh";
import {Dealmachine} from "../../entities/dealmachine.entity";
import {spawn} from "child_process";


/// ---------------- TO DOWNLOAD FILE

// Node 18+: global fetch available
function pickFilename(urlStr: string, contentDisposition?: string | null) {
    if (contentDisposition) {
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(contentDisposition);
        if (m) return decodeURIComponent(m[1]);
    }
    try {
        const u = new URL(urlStr);
        const last = path.basename(u.pathname) || 'download';
        return last.includes('.') ? last : `${last}.csv`;
    } catch {
        return 'download.csv';
    }
}

function extractHtmlRedirect(html: string, baseUrl: string): string | null {
    // <meta http-equiv="refresh" content="0; url=https://...">
    const meta = html.match(/http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"']+)["']/i);
    if (meta?.[1]) {
        try { return new URL(meta[1].trim(), baseUrl).toString(); } catch {}
    }
    // obvious anchor (“click here” etc.)
    const a = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(?:click here|download|this link|continue)[^<]*<\/a>/i);
    if (a?.[1]) {
        try { return new URL(a[1].trim(), baseUrl).toString(); } catch {}
    }
    // fallback: first absolute https link
    const any = html.match(/https?:\/\/[^\s"'<>]+/i);
    if (any?.[0]) return any[0];
    return null;
}

async function resolveFinalUrl(startUrl: string, maxHops = 5): Promise<string> {
    let url = startUrl;
    for (let i = 0; i < maxHops; i++) {
        const res = await fetch(url, {
            redirect: 'follow', // follow 30x
            headers: { 'User-Agent': 'MoverLeadBot/1.0 (+fetch)' },
        });

        const ct = res.headers.get('content-type') || '';
        // If NOT HTML, we’re at the real file (S3, CDN, etc.)
        if (!ct.toLowerCase().includes('text/html')) {
            // if we followed a 30x, res.url will already be the final
            return res.url || url;
        }

        // It’s HTML. Try to extract next hop.
        const html = await res.text();
        const next = extractHtmlRedirect(html, res.url || url);
        if (!next) {
            // No obvious redirect in HTML; stop here (caller will download this page if needed)
            return res.url || url;
        }
        url = next;
    }
    return url;
}
/// ------- TO CLOSE FILE
//------- NEWONE -----


//----end

@Injectable()
export class PropertiesService {
    private stripe: Stripe;
    // Temporary token storage (for short-term use)
    private accessTokenPrecisely: string = null;
    private tokenExpirationTime: number = null;
    private readonly ENRICHMENT_COST = 0.02;
    private readonly logger = new Logger(PropertiesService.name);


    constructor(
        private readonly propertyRepository: PropertyRepository,
        private readonly userRepository: UserRepository,
        private readonly countyRepository: CountyRepository,
        private readonly httpService: HttpService,
        private readonly stripeService: StripeService,
        private readonly propertyListingRepository: PropertyListingRepository,
        private readonly propertyHomeownerEnrichmentRepository: PropertyHomeownerEnrichmentRepository,
        private readonly userPropertyFilteringRepository: UserPropertyFilteringRepository,
        private readonly userVisibleListingRepository: UserVisibleListingRepository,
        private readonly userExtrasAccessRepository: UserExtrasAccessRepository,
        private readonly userSubscriptionRepository: UserSubscriptionRepository,
        private readonly propertyAiFilteringRepository: PropertyAiFilteringRepository,
        private readonly userTokenService: UserTokenService,
        private readonly dealmachineRepository: DealmachineRepository,
        private readonly gmailService: GmailService,


        @InjectQueue('ai-filtering')
        private readonly aiFilteringQueue: Queue,

        private readonly aiService: AiService,
        @Inject(forwardRef(() => ScrapperService))
        private readonly scrapperService: ScrapperService,
    ) {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }


    private pickFilename(urlStr: string, contentDisposition?: string | null) {
        try {
            if (contentDisposition) {
                const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(contentDisposition);
                if (m) return decodeURIComponent(m[1]);
            }
            const u = new URL(urlStr);
            const base = path.basename(u.pathname) || 'download.csv';
            return base.includes('.') ? base : `${base}.csv`;
        } catch {
            return 'download.csv';
        }
    }

    private extractHtmlRedirect(html: string, baseUrl: string): string | null {
        const meta = html.match(/http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"']+)["']/i);
        if (meta?.[1]) {
            try { return new URL(meta[1].trim(), baseUrl).toString(); } catch {}
        }
        const a = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(?:click here|download|continue)[^<]*<\/a>/i);
        if (a?.[1]) {
            try { return new URL(a[1].trim(), baseUrl).toString(); } catch {}
        }
        const any = html.match(/https?:\/\/[^\s"'<>]+/i);
        return any?.[0] || null;
    }

    private async resolveFinalUrl(startUrl: string, maxHops = 5) {
        let url = startUrl;
        for (let i = 0; i < maxHops; i++) {
            const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MoverLeadBot/1.0' } });
            const ct = res.headers.get('content-type') || '';
            if (!ct.toLowerCase().includes('text/html')) return res.url || url;
            const html = await res.text();
            const next = this.extractHtmlRedirect(html, res.url || url);
            if (!next) return res.url || url;
            url = next;
        }
        return url;
    }


    async getDashboard(userId: string) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);


        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayCount = await this.userVisibleListingRepository
            .createQueryBuilder('userVisibleListing')
            .leftJoinAndSelect('userVisibleListing.propertyListing', 'propertyListing')
            .leftJoinAndSelect('propertyListing.property', 'property') // ✅ fixed
            .where('userVisibleListing.user_id = :userId', {userId})
            .andWhere('propertyListing.status_date >= :todayStart', {todayStart})
            .andWhere('propertyListing.status_date < :todayEnd', {todayEnd})
            .getCount();

        const thisMonthCount = await this.userVisibleListingRepository
            .createQueryBuilder('userVisibleListing')
            .leftJoinAndSelect('userVisibleListing.propertyListing', 'propertyListing')
            .leftJoinAndSelect('propertyListing.property', 'property') // ✅ fixed
            .where('userVisibleListing.user_id = :userId', {userId})
            .andWhere('propertyListing.status_date >= :thisMonthStart', {thisMonthStart})
            .andWhere('propertyListing.status_date < :thisMonthEnd', {thisMonthEnd})
            .getCount();

        const lastMonthCount = await this.userVisibleListingRepository
            .createQueryBuilder('userVisibleListing')
            .leftJoinAndSelect('userVisibleListing.propertyListing', 'propertyListing')
            .leftJoinAndSelect('propertyListing.property', 'property') // ✅ fixed
            .where('userVisibleListing.user_id = :userId', {userId})
            .andWhere('propertyListing.status_date >= :lastMonthStart', {lastMonthStart})
            .andWhere('propertyListing.status_date < :lastMonthEnd', {lastMonthEnd})
            .getCount();


        return {
            todayCount,
            thisMonthCount,
            lastMonthCount
        }
    }

    async getListings(dto: GetListingsDto, userId: string): Promise<GetListingsResponseDto> {
        console.log("userId: ", userId);
        const query = this.userVisibleListingRepository
            .createQueryBuilder('userVisibleListing')
            .leftJoinAndSelect('userVisibleListing.propertyListing', 'propertyListing')
            .leftJoinAndSelect('propertyListing.property', 'property')
            .leftJoinAndSelect('property.homeownerEnrichment', 'homeownerEnrichment')
            .leftJoinAndMapOne(
                'property.userPropertyFiltering',
                UserPropertyFiltering,
                'filtering',
                'filtering.property_id = property.id AND filtering.user_id = :userId',
                {userId}
            )
            // AI filtering row
            .leftJoinAndMapOne(
                'property.aiFiltering',
                PropertyAiFiltering,
                'paf',
                'paf.property_id = property.id'
            )
            // **grant check join**
            .leftJoinAndMapOne(
                'property.userExtrasAccessGrant',    // singular
                UserExtrasAccess,
                'uea',
                `uea.property_id = property.id
   AND uea.user_id    = :userId
   AND uea.access_type = :accessType`,
                {userId, accessType: UserExtrasAccessType.AI_FILTERING}
            )
            .where('userVisibleListing.user_id = :userId', {userId});

        // ✅ Normalize array-based filters to avoid TypeORM .map() error
        const propertyStatuses = Array.isArray(dto.propertyStatus)
            ? dto.propertyStatus
            : dto.propertyStatus
                ? [dto.propertyStatus]
                : [];

        // ✅ Normalize array-based filters to avoid TypeORM .map() error
        const propertyTypes = Array.isArray(dto.propertyType)
            ? dto.propertyType
            : dto.propertyType
                ? [dto.propertyType]
                : [];

        const filteredStatuses = Array.isArray(dto.filteredStatus)
            ? dto.filteredStatus
            : dto.filteredStatus
                ? [dto.filteredStatus]
                : [];

        const states = Array.isArray(dto.state)
            ? dto.state
            : dto.state
                ? [dto.state]
                : [];

        // ✅ Apply filters
        if (propertyStatuses.length) {
            query.andWhere('propertyListing.status IN (:...statuses)', {
                statuses: propertyStatuses,
            });
        }

        if(propertyTypes.length) {
            query.andWhere('property.home_type IN (:...types)', {
                types: propertyTypes,
            });
        }
/*
        if (filteredStatuses.length) {
            query.andWhere('filtering.filtered_status IN (:...filteredStatuses)', {
                filteredStatuses,
            });
        }

 */

        if (filteredStatuses.length) {
            query.andWhere(
                `(filtering.filtered_status IN (:...filteredStatuses) OR (
            paf.filtered_status IN (:...filteredStatuses)
            AND paf.job_status = :completedStatus
            AND uea.id IS NOT NULL
        ))`,
                {
                    filteredStatuses,
                    completedStatus: AiFilteringJobStatus.COMPLETED,
                }
            );
        }


        if (states.length) {
            query.andWhere('property.state IN (:...states)', {
                states,
            });
        }
// 1) Compute “today at 00:01 UTC”
        const now = new Date();
        const startOfUtcDay = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                0,   // hours
                1,   // minutes
                0    // seconds
            )
        );

// 2) Pick either the client-provided date or the default
        const dateFromFilter = dto.dateFrom
            ? new Date(dto.dateFrom)
            : startOfUtcDay;

// 3) Always apply the >= filter
        query.andWhere('propertyListing.statusDate >= :dateFrom', {
            dateFrom: dateFromFilter,
        });

// 4) Only apply an upper bound if they passed dateTo
        if (dto.dateTo) {
            query.andWhere('propertyListing.statusDate <= :dateTo', {
                dateTo: new Date(dto.dateTo),
            });
        }


        if (dto.propertyValueFrom) {
            console.log("propertyValueFrom type", typeof dto.propertyValueFrom)
            console.log("propertyValueFrom", dto.propertyValueFrom)
            query.andWhere('property.price >= :priceFrom', {
                priceFrom: Number(dto.propertyValueFrom),
            });
        }

        if (dto.propertyValueTo) {
            console.log("propertyValueTo type", typeof dto.propertyValueTo)
            console.log("propertyValueTo" + dto.propertyValueTo)
            query.andWhere('property.price <= :priceTo', {
                priceTo: Number(dto.propertyValueTo),
            });
        }

        // ✅ Count total matching records
        const totalRecords = await query.getCount();

        // ✅ Paginate and sort
        const limit = dto.limit ?? 10;
        const offset = dto.offset ?? 0;

        query.orderBy('propertyListing.statusDate', 'DESC');
        query.take(limit);
        query.skip(offset);

        const records = await query.getMany();

        // ✅ Format result
        const result: GetListingObjectDto[] = records.map((userVisible) => {
            const listing = userVisible.propertyListing;
            const property = listing.property;
            const enrichment = property.homeownerEnrichment;
            const filtering = property.userPropertyFiltering;
            const aiFiltering = property.aiFiltering;
            const hasAiGrant = !!property.userExtrasAccessGrant;

            const fullName =
                enrichment?.ownerFirstName && enrichment?.ownerLastName
                    ? `${enrichment.ownerFirstName} ${enrichment.ownerLastName}`
                    : enrichment
                        ? 'No data found'
                        : 'Not checked';


            // → priority: AI → manual → default
            let filteredStatus: string;
            if (aiFiltering && hasAiGrant) {
                // If a background job exists for this property…
                if (aiFiltering.jobStatus === AiFilteringJobStatus.COMPLETED) {
                    // …and it’s finished, show the actual verdict
                    filteredStatus = aiFiltering.filteredStatus;
                } else {
                    // …otherwise (PENDING or FAILED), show “AiFilteringRunning”
                    filteredStatus = aiFiltering.filteredStatus;
                }
            } else if (filtering?.filteredStatus) {
                // No AI run/access, but manual filtering exists
                filteredStatus = filtering.filteredStatus;
            } else {
                filteredStatus = undefined;
            }

            return {
                id: listing.id,
                filteredStatus: filteredStatus,
                propertyStatus: listing.status,
                propertyStatusDate: listing.statusDate?.toISOString() ?? '',
                fullName,
                fullAddress: `${property.streetAddress}, ${property.city}, ${property.state}, ${property.zipcode}`,
                state: property.state,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                price: property.price?.toString(),
                homeType: property.homeType,
                realtorName: property.realtorName,
                realtorPhone: property.realtorPhone,
                brokerageName: property.brokerageName,
                brokeragePhone: property.brokeragePhone,
            };
        });

        return {
            result,
            totalRecords,
            limit,
            offset,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(totalRecords / limit),
        };
    }


    async listingsExportDetailed(dto: ListingsExportDto): Promise<StreamableFile> {
        const listings = await this.propertyListingRepository.find({
            where: {id: In(dto.ids)},
            relations: ['property', 'property.homeownerEnrichment'],
        });

        const csvRows = listings.map((listing) => {
            const property = listing.property;
            const enrichment = property.homeownerEnrichment;

            return {
                ListingID: listing.id,
                PropertyID: property.id,
                Status: listing.status,
                StatusDate: listing.statusDate?.toISOString() ?? '',
                Address: `${property.streetAddress}, ${property.city}, ${property.state}, ${property.zipcode}`,
                Bedrooms: property.bedrooms ?? '',
                Bathrooms: property.bathrooms ?? '',
                Price: property.price ?? '',
                HomeType: property.homeType ?? '',
                RealtorName: property.realtorName ?? '',
                RealtorPhone: property.realtorPhone ?? '',
                BrokerageName: property.brokerageName ?? '',
                BrokeragePhone: property.brokeragePhone ?? '',
                OwnerFirstName: enrichment?.ownerFirstName ?? 'Not checked',
                OwnerLastName: enrichment?.ownerLastName ?? 'Not checked',
                OwnerType: enrichment?.isCommercial ?? 'Not checked',
            };
        });

        const csv = stringify(csvRows, {
            header: true,
        });

        return new StreamableFile(Buffer.from(csv));
    }

    async listingsExportUsps(dto: ListingsExportDto): Promise<StreamableFile> {
        const listings = await this.propertyListingRepository.find({
            where: {id: In(dto.ids)},
            relations: ['property', 'property.homeownerEnrichment'],
        });

        const csvRows = listings.map((listing) => {
            const property = listing.property;
            const enrichment = property.homeownerEnrichment;

            const hasOwner = enrichment?.ownerFirstName && enrichment?.ownerLastName;
            const ownerFullname = hasOwner
                ? `${enrichment.ownerFirstName} ${enrichment.ownerLastName}`
                : 'Current';

            const currentResident = hasOwner
                ? 'Or Current Resident'
                : 'Resident';

            let zipcode = property.zipcode || '';
            if (zipcode.length === 4) {
                zipcode = '0' + zipcode;
            }

            return {
                owner_fullname: ownerFullname,
                current_resident: currentResident,
                address: property.streetAddress ?? '',
                city: property.city ?? '',
                state: property.state ?? '',
                zipcode,
            };
        });

        const csv = stringify(csvRows, {
            header: true,
            columns: [
                {key: 'owner_fullname', header: 'owner_fullname'},
                {key: 'current_resident', header: 'current_resident'},
                {key: 'address', header: 'address'},
                {key: 'city', header: 'city'},
                {key: 'state', header: 'state'},
                {key: 'zipcode', header: 'zipcode'},
            ],
        });

        return new StreamableFile(Buffer.from(csv));
    }

    async filtering(dto: GetListingsDto, userId: string): Promise<FilteringResponseDto> {
        const {limit = 10, offset = 0} = dto;
        const query = this.userVisibleListingRepository
            .createQueryBuilder('userVisibleListing')
            .leftJoinAndSelect('userVisibleListing.propertyListing', 'propertyListing')
            .leftJoinAndSelect('propertyListing.property', 'property')

            // Join manual user filtering (exclude if exists)
            .leftJoinAndMapOne(
                'property.userPropertyFiltering',
                UserPropertyFiltering,
                'filtering',
                'filtering.property_id = property.id AND filtering.user_id = :userId',
                { userId }
            )

            // Join AI filtering info (may exist, using virtual alias to avoid entity modification)
            .leftJoinAndMapOne(
                'property._aiFiltering',
                PropertyAiFiltering,
                'paf',
                'paf.property_id = property.id'
            )

            // Join AI filtering access grant (must exist if paf exists)
            .leftJoinAndMapOne(
                'property.userExtrasAccessGrant',
                UserExtrasAccess,
                'uea',
                `uea.property_id = property.id
         AND uea.user_id = :userId
         AND uea.access_type = :accessType`,
                {
                    userId,
                    accessType: UserExtrasAccessType.AI_FILTERING
                }
            )

            .where('userVisibleListing.user_id = :userId', { userId })

            // ✅ Exclude if user already manually filtered this property
            .andWhere('filtering.id IS NULL')

            // ✅ Exclude if property was AI-filtered AND user has access to that AI filter
            .andWhere(`NOT (
        paf.job_status = :completedStatus
        AND paf.filtered_status IS NOT NULL
        AND uea.id IS NOT NULL
    )`, {
                completedStatus: AiFilteringJobStatus.COMPLETED,
            })

            // ✅ Only show properties with photos
            .andWhere('property.photos IS NOT NULL');


        // ✅ Apply filters from dto
        const propertyStatuses = Array.isArray(dto.propertyStatus)
            ? dto.propertyStatus
            : dto.propertyStatus
                ? [dto.propertyStatus]
                : [];


        if (propertyStatuses.length) {
            query.andWhere(`propertyListing.status IN (:...statuses)`, {
                statuses: propertyStatuses,
            });
        }

        // ✅ Apply filters from dto
        const propertyTypes = Array.isArray(dto.propertyType)
            ? dto.propertyType
            : dto.propertyType
                ? [dto.propertyType]
                : [];


        if (propertyTypes.length) {
            query.andWhere(`propertyListing.status IN (:...statuses)`, {
                statuses: propertyTypes,
            });
        }

        const states = Array.isArray(dto.state)
            ? dto.state
            : dto.state
                ? [dto.state]
                : [];

        if (states.length) {
            query.andWhere('property.state IN (:...states)', {
                states,
            });
        }

        if (dto.propertyValueFrom) {
            query.andWhere('property.price >= :priceFrom', {
                priceFrom: Number(dto.propertyValueFrom),
            });
        }

        if (dto.propertyValueTo) {
            query.andWhere('property.price <= :priceTo', {
                priceTo: Number(dto.propertyValueTo),
            });
        }


        // 1) Compute “today at 00:01 UTC”
        const now = new Date();
        const startOfUtcDay = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                0,   // hours
                1,   // minutes
                0    // seconds
            )
        );

        // 2) Pick either the client-provided date or the default
        const dateFromFilter = dto.dateFrom
            ? new Date(dto.dateFrom)
            : startOfUtcDay;

        // 3) Always apply the >= filter
        query.andWhere('propertyListing.statusDate >= :dateFrom', {
            dateFrom: dateFromFilter,
        });

        // 4) Only apply an upper bound if they passed dateTo
        if (dto.dateTo) {
            query.andWhere('propertyListing.statusDate <= :dateTo', {
                dateTo: new Date(dto.dateTo),
            });
        }

        // ✅ Pagination + total count
        const totalRecords = await query.getCount();

        const listings = await query
            .orderBy('property.createdAt', 'DESC')
            .take(limit)
            .skip(offset)
            .getMany();

        // ✅ Map to FilteringObjectDto[]
        const result: FilteringObjectDto[] = listings.map((userVisible) => ({
            id: userVisible.propertyListing.property.id,
            photos: userVisible.propertyListing.property.photos ?? [],
        }));
        listings.forEach((l) => {
            console.log({
                propertyId: l.propertyListing.property.id,
                aiStatus: l.propertyListing.property.aiFiltering?.jobStatus,
                aiFiltered: l.propertyListing.property.aiFiltering?.filteredStatus,
                userHasAccess: !!l.propertyListing.property.userExtrasAccessGrant,
            });
        });

        return {
            result,
            totalRecords,
            limit,
            offset,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(totalRecords / limit),
        };
    }


    async filteringAction(propertyId: string, dto: FilteringActionDto, userId: string): Promise<MessageResponseDto> {
        const property = await this.propertyRepository.findOne({
            where: {id: propertyId},
        });

        if (!property) {
            throw new NotFoundException('Property not found');
        }

        const existing = await this.userPropertyFilteringRepository.findOne({
            where: {
                user: {id: userId},
                property: {id: propertyId},
            },
        });

        if (existing) {
            // Optional: Update instead of throwing
            existing.filteredStatus = dto.action;
            await this.userPropertyFilteringRepository.save(existing);
            return {message: 'Filtering updated'};
        }

        const newFiltering = this.userPropertyFilteringRepository.create({
            user: {id: userId},
            property,
            filteredStatus: dto.action,
        });

        await this.userPropertyFilteringRepository.save(newFiltering);

        return {message: 'Filtering saved'};
    }


    async listStates(): Promise<StateResponseDto[]> {
        return Object.values(statesArray);
    }

    /* PRODUCTS SERVICES */
    async getProducts(getProductsDto: GetProductsDto) {
        return this.countyRepository.getProducts(getProductsDto);
    }

    async getSubscriptions(
        id: string,
        getSubscriptionsDto: GetSubscriptionsDto
    ): Promise<GetSubscriptionsResponseDto[]> {
        const user: User = await this.userRepository.findOne({where: {id}});
        if (!user) {
            throw new BadRequestException("User not found");
        }

        const getSubscriptionsResponseDto: GetSubscriptionsResponseDto[] = [];

        const stripeUserId: string = user.stripeId;
        if (!stripeUserId) {
            return getSubscriptionsResponseDto;
        }

        const stripeSubscriptionData = await this.stripe.subscriptions.list({
            customer: stripeUserId,
            status: getSubscriptionsDto.stripeSubscriptionStatus,
        });
        console.log("CONSOLE LOG SUBSCRIPTION", stripeSubscriptionData.data[0].items.data[0].price)

        if (stripeSubscriptionData && stripeSubscriptionData.data.length > 0) {
            for (const subscription of stripeSubscriptionData.data) {
                const subscriptionItems: SubscriptionItemsDto[] = [];
                let totalPrice: number = 0;
                for (const item of subscription.items.data) {
                    const product = await this.stripe.products.retrieve(
                        item.plan.product.toString() as string
                    );

                    totalPrice = totalPrice + item.price.unit_amount / 100;

                    subscriptionItems.push({
                        name: product.name,
                        price: item.price.unit_amount / 100,
                    });
                }

                getSubscriptionsResponseDto.push({
                    id: subscription.id,
                    status: subscription.status.toString() as string,
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    currentPeriodStart: new Date(
                        subscription.current_period_start * 1000
                    ),
                    subscriptionItems: subscriptionItems,
                    totalPrice: totalPrice,
                });
            }

            return getSubscriptionsResponseDto;
        } else {
            return getSubscriptionsResponseDto;
        }
    }


    async getAllActiveCounties(): Promise<County[]> {
        // 1. Get distinct priceIds from active user subscriptions
        const activeSubscriptions = await this.userSubscriptionRepository.find({
            where: {status: 'active'},
            select: ['priceId'],
        });

        const uniquePriceIds = [...new Set(activeSubscriptions.map((sub) => sub.priceId))];

        if (uniquePriceIds.length === 0) {
            return [];
        }

        // 2. Find counties that match those priceIds
        const counties = await this.countyRepository.find({
            where: {priceId: In(uniquePriceIds)},
        });

        return counties;
    }


    async getChicagoCounties() {
        const counties = [
            '213a67cb-ea78-4b77-b178-b1b0da09d035', // Cook County
            'b271f13b-04ff-4d32-bfc0-74e650c51150', // Lake County
            'c840a95a-9523-4b34-b9ad-9e358712ab02', // McHenry County
            '9e159cf0-ee1a-4e08-8de0-1b1273f566ca', // DuPage County
            '7e9085b6-7882-4982-8b51-834869deb0c2', // Kane County
            '7607395d-c5aa-4482-931a-6d26aabf62ec', // Will County
        ];

        return await this.countyRepository.find({
            where: {id: In(counties)},
        });
    }

    async getCountiesWithZillowData(): Promise<County[]> {
        return this.countyRepository.find({
            where: {
                zillowLink: Not(IsNull()),
                zillowDefineInput: Not(IsNull()),
            },
        });
    }

    /*
        async getActiveStatesByUser(userId: string) {
            if (userId === '9f19f3b8-9892-4f5b-af57-b350d933424c') {
                return;
            }
            const user = await this.userRepository.findOneBy({id: userId});
            if (!user) {
                throw new HttpException('User is not found', HttpStatus.BAD_REQUEST)
            }


            if (!user.stripeId) {
                return;
            }
            // check active subscriptions
            const subscriptions: Stripe.ApiList<Stripe.Subscription> = await this.stripeService.getAllActiveSubscriptionsByUser(user.stripeId);
            if (!subscriptions) {
                return;
            }


            const priceIds = [
                ...new Set(
                    subscriptions.data.flatMap((subscription) =>
                        subscription.items.data.map((item) => item.price.id)
                    )
                ),
            ];

            const counties: County[] = await this.countyRepository.find({
                where: {priceId: In(priceIds)},
            });
            if (counties.length === 0) {
                throw new HttpException("No county found", HttpStatus.BAD_REQUEST);
            }

            const uniqueStatesAbbreviation = [...new Set(counties.map((item) => item.state))];

            const stateResponse: StateResponseDto[] = uniqueStatesAbbreviation.map((abbr) => {
                const stateInfo = statesArray.find((state) => state.abbreviation === abbr);

                return {
                    abbreviation: abbr,
                    name: stateInfo?.name ?? 'Unknown',
                };
            });

            return stateResponse;
        }


     */
    async getActiveStatesByUser(userId: string) {

        // (1) Make sure the user exists
        const user = await this.userRepository.findOneBy({id: userId});
        if (!user) {
            throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
        }

        // (2) Bail if they never even connected Stripe
        if (!user.stripeId) {
            return;
        }

        // (3) Grab only the active subscriptions for that user from your own table
        const subs = await this.userSubscriptionRepository.find({
            where: {
                user: {id: userId},
                status: 'active',
            },
            select: ['priceId'],  // we only need the priceId
        });

        if (subs.length === 0) {
            throw new HttpException('No active subscriptions', HttpStatus.BAD_REQUEST);
        }

        // (4) Dedupe and extract just the price IDs
        const priceIds = Array.from(new Set(subs.map(s => s.priceId)));

        // (5) Look up all counties matching any of those price IDs
        const counties = await this.countyRepository.find({
            where: {priceId: In(priceIds)},
        });
        if (counties.length === 0) {
            throw new HttpException('No county found for your plans', HttpStatus.BAD_REQUEST);
        }

        // (6) Build the list of unique state abbreviations → full names
        const uniqueStates = Array.from(new Set(counties.map(c => c.state)));
        const stateResponse: StateResponseDto[] = uniqueStates.map(abbr => {
            const info = statesArray.find(s => s.abbreviation === abbr);
            return {
                abbreviation: abbr,
                name: info?.name ?? 'Unknown',
            };
        });

        return stateResponse;
    }

    async findProperty(zpid: string) {
        return await this.propertyRepository.findOneBy({zpid})
    }

    async checkPropertyDaily(property: Property, currentStatus: string, initialScrapper: boolean, date: Date, raw: any) {
        try {
            // Map currentStatus string → PropertyStatus enum
            const statusMap = {
                Pending: PropertyStatus.PENDING,
                ComingSoon: PropertyStatus.COMING_SOON,
                ForSale: PropertyStatus.FOR_SALE,
            };

            const matchedStatus = statusMap[currentStatus];

            if (!matchedStatus) {
                console.log(`⚠️ Unknown status: ${currentStatus}`);
                return;
            }

            // Check if this status already exists for this property
            const existingStatus = await this.propertyListingRepository.findOne({
                where: {
                    property: {id: property.id},
                    status: matchedStatus,
                },
            });
            if (existingStatus) {
                console.log(`ℹ️ Status ${matchedStatus} already exists for property ${property.zpid}`);
                return;
            }

            // Save the new listing status
            const savedListingProperty: PropertyListing = await this.propertyListingRepository.save({
                property,
                status: matchedStatus,
                statusDate: date,
            });
            console.log("savedListingProperty.id", savedListingProperty.id)
            console.log(`✅ Status ${matchedStatus} saved for ${property.zpid}`);

            /*
            // Prepare enrichment data
            const data: FillPropertyInfoDto = {
                streetAddress: raw.hdpData.homeInfo.streetAddress,
                zipcode: raw.hdpData.homeInfo.zipcode,
                city: raw.hdpData.homeInfo.city,
                state: raw.hdpData.homeInfo.state,
                bedrooms: raw.hdpData.homeInfo.bedrooms,
                bathrooms: raw.hdpData.homeInfo.bathrooms,
                price: raw.hdpData.homeInfo.price,
                homeType: raw.hdpData.homeInfo.homeType,
                brokerageName: raw.brokerName,
                latitude: raw.hdpData.homeInfo.latitude,
                longitude: raw.hdpData.homeInfo.longitude,
                livingAreaValue: raw.hdpData.homeInfo.livingArea,
                timeOnZillow: raw.timeOnZillow,
            };

            Object.assign(property, data);
            property.initialScrape = initialScrapper;
            console.log(`🏡 Property updated for ${property.zpid}`);
            const savedProperty = await this.propertyRepository.save(property);
    */
            return {savedListingProperty};
        } catch (error) {
            console.log("CATCH IN CHECK DAILY", error)
        }
    }

    async createPropertyListing(property: Property, status: PropertyStatus, date: Date) {
        const propertyListing = this.propertyListingRepository.create({
            property,
            status,
            statusDate: date,
        });

        return await this.propertyListingRepository.save(propertyListing);
    }


    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async grantBulkListingAccessToSubscribedUsers(
        listings: PropertyListing[],
        countyId: string
    ): Promise<void> {
        console.log(
            `🔄 [grantBulkListingAccess] called with ${listings.length} listings…`
        );
        if (listings.length === 0) {
            console.log('ℹ️ No listings to grant access for.');
            return;
        }

        try {
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!! HERE STARTED');

            // 1) All listings assumed from same county

            // 2) Fetch county once

            await this.sleep(1000);
            const county = await this.countyRepository.findOne({
                where: {id: countyId},
            });
            if (!county?.priceId) {
                console.warn(
                    `[grantBulkListingAccess] ❌ No priceId for county ${countyId}`
                );
                return;
            }
            console.log(
                `[grantBulkListingAccess] priceId = ${county.priceId}, fetching active subs…`
            );

            // 3) Fetch active subscriptions

            await this.sleep(1000);
            const activeSubs = await this.userSubscriptionRepository.find({
                where: {
                    priceId: county.priceId,
                    status: 'active',
                },
                relations: ['user'],
            });
            console.log(
                `[grantBulkListingAccess] found ${activeSubs.length} active subscriptions`
            );
            if (activeSubs.length === 0) {
                console.log(
                    `[grantBulkListingAccess] ℹ️ No active subscriptions for county ${county.name}`
                );
                return;
            }
            const users = Array.from(
                new Map(activeSubs.map((s) => [s.user.id, s.user])).values()
            );
            console.log(
                `[grantBulkListingAccess] deduped to ${users.length} unique users`
            );

            // 4) Fetch existing UVLs for all listings in one go
            const listingIds = listings.map((l) => l.id);
            console.log(
                `[grantBulkListingAccess] fetching existing UVLs for listing IDs: ${listingIds.join(
                    ','
                )}`
            );
            await this.sleep(1000);
            const existingUVLs = await this.userVisibleListingRepository.find({
                where: {propertyListing: {id: In(listingIds)}},
                relations: ['user', 'propertyListing'],
            });
            console.log(
                `[grantBulkListingAccess] found ${existingUVLs.length} existing UVLs`
            );

            // 5) Build set of already-granted pairs
            const haveAccess = new Set(
                existingUVLs.map((u) => `${u.propertyListing.id}:${u.user.id}`)
            );

            // 6) Build missing UVLs
            const toSave: UserVisibleListing[] = [];
            for (const listing of listings) {
                for (const user of users) {
                    const key = `${listing.id}:${user.id}`;
                    if (!haveAccess.has(key)) {
                        toSave.push(
                            this.userVisibleListingRepository.create({
                                user,
                                propertyListing: listing,
                            })
                        );
                        haveAccess.add(key);
                    }
                }
            }
            console.log(
                `[grantBulkListingAccess] will insert ${toSave.length} new UVLs`
            );

            // 7) Bulk insert
            if (toSave.length) {
                await this.userVisibleListingRepository.save(toSave);
                console.log(
                    `✅ [grantBulkListingAccess] Assigned ${toSave.length} new UVLs across ${listings.length} listings`
                );
            } else {
                console.log(
                    `ℹ️ [grantBulkListingAccess] All users already had access for these ${listings.length} listings`
                );
            }
        } catch (err) {
            console.error(
                `❌ [grantBulkListingAccess] Error while granting access:`,
                err
            );
            throw err;
        }
    }

    /*
    Okay, so it looks like the user is asking us to review their async methods, especially focusing on missing grants despite the logic aimed at adding properties when necessary. It seems there’s an issue in step 4 of readRawData, where newPropsToInsert scans and marks placeholders using existingPropertiesMap.set(z, null as any). I’ll need to figure out if the placeholder marking or the way properties are being handled might be causing the missing grants. I’ll focus on this particular area closely to isolate the problem.

Okay, it looks like there’s a potential issue with the way existingPropertiesMap.get() handles new properties. Placeholders are being set to null, but they're replaced after the bulk insert. The problem arises if newPropsToInsert.length === 0, in which case existing properties are used without including any new ones. Additionally, I think there could be an issue with duplicate zpids in validItems that might affect the final set of properties. I need to dig deeper into the logic around how validItems is processed.

It seems like the core issue is related to missing grants for certain properties. When the newPropsToInsert length is zero, the code only deals with existing properties, and there are cases where new entries are skipped. Looking at the method grantBulkListingAccessToSubscribedUsers, it feels like it only grants access to new listings that were just saved. However, it's unclear whether new raw items are being processed properly, especially when their statuses don’t match the expected ones. Inconsistent mappings for status codes could be a key cause of missing grants. I need to check these incoming raw statuses.

It seems the issue arises from how grantBulkListingAccessToSubscribedUsers handles countyId. The method relies on listings' property.countyId, but during propertyListingCreate, only the property ID is included. This causes the countyId to be unavailable when trying to fetch county data, resulting in skipped grants. A possible solution is to fetch the countyId through the property.id explicitly during the grant process, or to ensure that the relations are correctly loaded in propertyListingFind.
     */


    async getEnrichmentUrls(): Promise<{ url: string; }[]> {
        const properties = await this.propertyRepository.find({
            where: {
                initialScrape: false,
                enriched: IsNull() || false,
            },
        });

        if (properties.length == 0) {
            console.log("There is no properties to be enriched.")
            return null;
        }
        console.log("NUMBER OF PROPERTIES THAT NEED TO BE SCRAPPED: " + properties.length);


        return properties.map((property) => ({
            url: `https://www.zillow.com/homedetails/${property.zpid}_zpid/`,
        }));
    }


    async fillBrightdata(fillBrightdataDto: FillBrightdataDto, brightdataVersion: BrightdataVersion) {
        const {zpid} = fillBrightdataDto;
        console.log(`Filling with brightdata info: ${zpid}`)

        let property = await this.propertyRepository.findOne({where: {zpid}});

        if (!property) {
            return;
        }


        // Assign all DTO fields (overwrites any existing fields)
        Object.assign(property, fillBrightdataDto);
        property.enriched = true;
        console.log(`Property ${fillBrightdataDto.zpid} is enriched with Brightdata...`)
        return await this.propertyRepository.save(property);
    }

    async fillHasdata(fillBrightdataDto: FillBrightdataDto,) {
        const {zpid} = fillBrightdataDto;
        console.log(`Filling with brightdata info: ${zpid}`)

        let property = await this.propertyRepository.findOne({where: {zpid}});

        if (!property) {
            return;
        }
        property.enriched = true;
        // Assign all DTO fields (overwrites any existing fields)
        Object.assign(property, fillBrightdataDto);
        console.log(`Property ${fillBrightdataDto.zpid} is enriched with Hasdata...`)
        return await this.propertyRepository.save(property);
    }


    async getCountyZillowData(id: string) {
        const county = await this.countyRepository.findOne({where: {id}});
        if (!county) {
            throw new BadRequestException("Could not find county with provided id")
        }
        return {
            zillowLink: county.zillowLink,
            zillowDefineInput: county.zillowDefineInput
        }
    }

    /* ---------------- DELETE FROM HERE AFTER IMPROVING PRECISELY -----------------------*/


    private async getToken(): Promise<string> {
        const key = process.env.PRECISELY_API_KEY;
        const secret = process.env.PRECISELY_API_SECRET;

        // If accessToken is not set OR token is expired OR invalid format (e.g. server rebooted)
        if (
            !this.accessTokenPrecisely ||
            !this.tokenExpirationTime ||
            Date.now() > this.tokenExpirationTime
        ) {
            await this.fetchToken(key, secret);
        }

        return this.accessTokenPrecisely;
    }

    private async fetchToken(key: string, secret: string): Promise<void> {
        const encodedCredentials = Buffer.from(`${key}:${secret}`).toString('base64');

        try {
            const response = await axios.post(
                'https://api.precisely.com/oauth/token',
                new URLSearchParams({grant_type: 'client_credentials'}),
                {
                    headers: {
                        Authorization: `Basic ${encodedCredentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );

            const {access_token, expiresIn} = response.data;

            if (!access_token || !expiresIn) {
                throw new Error('❌ Invalid Precisely token response');
            }


            this.accessTokenPrecisely = access_token;
            this.tokenExpirationTime = Date.now() + expiresIn * 1000 - 5 * 60 * 1000;

            console.log('[Precisely] ✅ Token refreshed. Expires in (s):', expiresIn);
        } catch (error) {
            const errMsg = error?.response?.data || error.message;
            console.error('❌ [Precisely] Failed to fetch token:', errMsg);
            throw new Error('Precisely token fetch failed');
        }
    }

    async checkHomeownerEnrichment(
        listingsExportDto: ListingsExportDto,
        userId: string,
    ): Promise<void> {
        const {ids} = listingsExportDto;

        // 1) Load only the listings the user requested AND which they do _not_ already have access to
        const toProcess = await this.propertyListingRepository
            .createQueryBuilder('pl')
            .innerJoinAndSelect('pl.property', 'p')
            // eager‐load any existing enrichment
            .leftJoinAndSelect('p.homeownerEnrichment', 'phe')
            // LEFT JOIN onto our access table, filtering for this user & this extra type
            .leftJoin(
                UserExtrasAccess,
                'uea',
                `
        uea.property_id = p.id
        AND uea.user_id = :userId
        AND uea.access_type = :type
      `,
                {
                    userId,
                    type: UserExtrasAccessType.HOMEOWNER_ENRICHMENT,
                },
            )
            .where('pl.id IN (:...ids)', {ids})
            .andWhere('uea.id IS NULL')
            .getMany();

        if (toProcess.length === 0) {
            throw new BadRequestException(
                'No new listings to enrich or grant access for',
            );
        }

        // 2) Check budget for all NEW charges
        const totalCost = toProcess.length * this.ENRICHMENT_COST;
        if (
            totalCost > 0 &&
            !(await this.userTokenService.checkBalance(userId, totalCost))
        ) {
            const balance = await this.userTokenService.getBalance(userId);
            throw new ForbiddenException(
                `Need ${totalCost} tokens; you have ${balance}`,
            );
        }

        // 3) Process each listing exactly once
        for (const listing of toProcess) {
            const property = listing.property;
            let deductToken = true;
            let enrichment: PropertyHomeownerEnrichment;

            // 3a) Enrich if needed
            if (!property.homeownerEnrichment) {
                const address = `${property.streetAddress}, ${property.city}, ${property.state}, ${property.zipcode}`;
                const url =
                    'https://api.precisely.com/property/v2/attributes/byaddress' +
                    `?address=${encodeURIComponent(address)}&attributes=owners`;

                try {
                    const apiToken = await this.getToken();
                    const {data} = await axios.get(url, {
                        headers: {Authorization: `Bearer ${apiToken}`},
                    });

                    const owners = data.propertyAttributes?.owners || [];

                    // — try first valid owner
                    for (const o of owners.slice(0, 3)) {
                        if (o.firstName || o.lastName) {
                            const fullName = `${o.firstName || ''} ${o.lastName || ''}`.toLowerCase();
                            const banned = [
                                'llc',
                                ' inc',
                                'corporation',
                                'trust',
                                'bank',
                                'estate',
                                'property',
                                'association',
                                'national',
                                'mortgage',
                                'federal',
                            ];
                            const isCommercial = banned.some(kw =>
                                fullName.includes(kw),
                            );

                            enrichment = await this.propertyHomeownerEnrichmentRepository.save({
                                property,
                                ownerFirstName: o.firstName,
                                ownerLastName: o.lastName,
                                isCommercial,
                                homeOwnerRawData: data,
                                isChecked: true,
                            });
                            break;
                        }
                    }

                    // — if no valid person, still save raw data, but don’t charge
                    if (!enrichment) {
                        enrichment = await this.propertyHomeownerEnrichmentRepository.save({
                            property,
                            homeOwnerRawData: data,
                            isChecked: true,
                        });
                        deductToken = false;
                    }

                    // — link enrichment back on property
                    property.homeownerEnrichment = enrichment;
                    await this.propertyRepository.save(property);
                } catch (err) {
                    this.logger.error(
                        `Error enriching ${property.id}: ${err.message}`,
                    );
                    // skip charging/granting on error
                    continue;
                }
            }

            // 3b) Deduct (if needed) & grant access once
            if (deductToken) {
                await this.userTokenService.deduct(
                    userId,
                    this.ENRICHMENT_COST,
                );
            }
            await this.userExtrasAccessRepository.save({
                user: {id: userId},
                property,
                accessType: UserExtrasAccessType.HOMEOWNER_ENRICHMENT,
                tokenUsed: deductToken ? this.ENRICHMENT_COST.toFixed(2) : '0.00',
            });
        }
    }
    async aiFiltering(
        listingsExportDto: ListingsExportDto,
        userId: string,
    ): Promise<{ propertyId: string; status: AiFilteringJobStatus }[]> {
        const { ids } = listingsExportDto;

        // 1) Fetch only propertyId + photos[] for each requested listing
        const raws = await this.propertyListingRepository
            .createQueryBuilder('pl')
            .innerJoin('pl.property', 'p')
            .select([
                'p.id AS "propertyId"',
                'p.photos AS "photos"',
            ])
            .where('pl.id IN (:...ids)', { ids })
            .getRawMany();

        if (!Array.isArray(raws) || raws.length === 0) {
            throw new BadRequestException(
                'No matching properties found for those IDs.'
            );
        }

        // 2) Deduplicate by propertyId
        const uniqueById = new Map<string, { propertyId: string; photos: any[] }>();
        for (const row of raws) {
            if (!uniqueById.has(row.propertyId)) {
                uniqueById.set(row.propertyId, {
                    propertyId: row.propertyId,
                    photos: Array.isArray(row.photos)
                        ? row.photos.slice(1, 21) // drop index 0, keep next 20
                        : [],
                });
            }
        }
        const uniqueProperties = [...uniqueById.values()];

        // 3) For each unique property:
        //    a) Ensure PropertyAiFiltering row exists with jobStatus = PENDING
        //    b) Ensure UserExtrasAccess exists (so user “has access” even while pending)
        //    c) Enqueue the background job if it wasn’t already pending/completed
        const results: { propertyId: string; status: AiFilteringJobStatus }[] = [];

        for (const { propertyId, photos } of uniqueProperties) {
            // a) Look up (or insert) the property‐AI‐filtering record
            let aiRow = await this.propertyAiFilteringRepository.findOne({
                where: { property: { id: propertyId } },
            });

            if (!aiRow) {
                // No row yet → create it as PENDING
                aiRow = this.propertyAiFilteringRepository.create({
                    property: { id: propertyId } as any,
                    jobStatus: AiFilteringJobStatus.PENDING,
                    filteredStatus: null,
                    rawResponse: null,
                });
                await this.propertyAiFilteringRepository.save(aiRow);
            } else if (aiRow.jobStatus === AiFilteringJobStatus.COMPLETED) {
                // Already done → nothing to update here, keep as COMPLETED
            } else if (aiRow.jobStatus === AiFilteringJobStatus.PENDING) {
                // Already pending → leave it alone
            } else {
                // It was FAILED or some other state → reset to PENDING
                aiRow.jobStatus = AiFilteringJobStatus.PENDING;
                aiRow.filteredStatus = null;
                aiRow.rawResponse = null;
                await this.propertyAiFilteringRepository.save(aiRow);
            }

            // b) Immediately grant UserExtrasAccess (if not already granted)
            const existingGrant = await this.userExtrasAccessRepository.findOne({
                where: {
                    user: { id: userId },
                    property: { id: propertyId },
                    accessType: UserExtrasAccessType.AI_FILTERING,
                },
            });

            if (!existingGrant) {
                const grant = this.userExtrasAccessRepository.create({
                    user: {id: userId} as any,
                    property: {id: propertyId} as any,
                    accessType: UserExtrasAccessType.AI_FILTERING,
                    tokenUsed: '0.03', // or whatever logic you have
                });

                await this.userTokenService.deduct(
                    userId,
                    0.03,
                );
            }
            // c) Enqueue a new job only if it’s not already COMPLETED or PENDING
            if (aiRow.jobStatus === AiFilteringJobStatus.COMPLETED) {
                results.push({ propertyId, status: AiFilteringJobStatus.COMPLETED });
            } else {
                // If it’s PENDING (newly created or reset), enqueue it.
                // (If it was already PENDING, this will re‐enqueue; you can skip re‐enqueuing
                // if you have a job‐dedup mechanism—Bull does not dedupe by default.)
                await this.aiFilteringQueue.add('classify-property', {
                    propertyId,
                    photos,
                    userId,
                });
                results.push({ propertyId, status: AiFilteringJobStatus.PENDING });
            }
        }

        // 4) Return immediately with each property’s current status
        return results;
    }




        async getCountyById(countyId: string): Promise<County> {
        if (!countyId) {
            this.logger.warn(`getCountyById called with empty id`);
            throw new BadRequestException('County ID must be provided');
        }

        this.logger.log(`🔍 Loading county with id=${countyId}`);
        try {
            const county = await this.countyRepository
                .createQueryBuilder('c')
                .where('c.id = :id', {id: countyId})
                .getOne();

            if (!county) {
                this.logger.error(`County not found: id=${countyId}`);
                throw new NotFoundException(`County ${countyId} not found`);
            }

            this.logger.log(`✅ Found county "${county.name}" (${county.id})`);
            return county;
        } catch (err) {
            // If it's one of our thrown exceptions, rethrow it
            if (err instanceof BadRequestException || err instanceof NotFoundException) {
                throw err;
            }
            // Otherwise log & wrap
            this.logger.error(`❌ Error loading county ${countyId}: ${err.message}`, err.stack);
            throw new BadRequestException('Failed to load county');
        }
    }


    async bulkCreateProperties(
        dtos: CreatePropertyDto[]
    ): Promise<Array<Pick<Property, 'id' | 'zpid'>>> {
        if (!dtos.length) return [];

        const result = await this.propertyRepository
            .createQueryBuilder()
            .insert()
            .into(Property)
            .values(dtos)
            .returning(['id', 'zpid'])
            .execute();

        // each generatedMap has shape { id: string, zpid: string }
        return result.generatedMaps as Array<Pick<Property, 'id' | 'zpid'>>;
    }

//: Promise<{ propertyId: string; url: string }[]>
    async getAllEnrichmentUrls() {
        const rows = await this.userVisibleListingRepository
            .createQueryBuilder('uvl')
            .innerJoin('uvl.propertyListing', 'pl')
            .innerJoin('pl.property', 'property')
            .where('property.enriched = FALSE OR property.enriched IS NULL')
            .select([
                'property.id AS propertyId',
                'property.zpid AS zpid',
            ])
            .distinct(true)
            .getRawMany<{ propertyId: string; zpid: string }>();

        const urls = rows.map(r => ({
            url: `https://www.zillow.com/homedetails/${r.zpid}_zpid/`,
        }));
        console.log("Number of urls: " + urls.length);
        return urls;
        //return {length: urls.length}
    }

    async findByZpids(zpids: string[]): Promise<Property[]> {
        if (!zpids || zpids.length === 0) {
            this.logger.log(`⚠️ findByZpids called with empty zpids array, returning []`);
            return [];
        }

        this.logger.log(`📦 findByZpids: loading ${zpids.length} properties by zpid`);

        try {
            const props = await this.propertyRepository
                .createQueryBuilder('p')
                .where('p.zpid IN (:...zpids)', {zpids})
                .getMany();

            this.logger.log(`✅ Loaded ${props.length}/${zpids.length} properties`);
            return props;
        } catch (err) {
            this.logger.error(
                `❌ findByZpids failed for [${zpids.join(',')}]: ${err.stack || err.message}`
            );
            throw err;
        }
    }

    async propertiesListingFind(properties: Property[]): Promise<PropertyListing[]> {
        const propertyIds = properties.map(p => p.id);
        if (propertyIds.length === 0) {
            this.logger.log(`📦 propertiesListingFind: no property IDs provided, returning []`);
            return [];
        }

        const statuses = [
            PropertyStatus.PENDING,
            PropertyStatus.COMING_SOON,
            PropertyStatus.FOR_SALE,
        ];

        this.logger.log(
            `📦 propertiesListingFind: loading listings for ${propertyIds.length} properties, statuses=${statuses.join(
                ','
            )}`
        );

        try {
            // Using QueryBuilder for clarity & potentially better performance:
            const listings = await this.propertyListingRepository
                .createQueryBuilder('pl')
                .innerJoinAndSelect('pl.property', 'property')
                .where('property.id IN (:...ids)', {ids: propertyIds})
                .andWhere('pl.status IN (:...statuses)', {statuses})
                .getMany();

            this.logger.log(`✅ Loaded ${listings.length} existing listings`);
            return listings;
        } catch (err) {
            this.logger.error(
                `❌ propertiesListingFind failed loading property IDs [${propertyIds.join(
                    ','
                )}]: ${err.stack || err.message}`
            );
            throw err;
        }
    }

    async propertyListingCreate(
        property: Property,
        status: PropertyStatus,
        statusDate: Date,
    ): Promise<PropertyListing> {
        this.logger.log(
            `➕ Creating listing for property=${property.id} status=${status}`,
        );
        try {
            // build the new entity
            const listing = this.propertyListingRepository.create({
                property,
                status,
                statusDate,
            });

            // attempt to save
            return await this.propertyListingRepository.save(listing);
        } catch (err: any) {
            // duplicate‐key on your composite property+status index?
            if (
                err.code === '23505' &&
                err.detail?.includes('property_id') &&
                err.detail?.includes('status')
            ) {
                this.logger.warn(
                    `⚠️ Listing (${property.id},${status}) already exists – skipping`,
                );
                throw new ConflictException(
                    `Listing for property ${property.id} with status ${status} already exists`,
                );
            }

            // otherwise an unexpected DB error
            this.logger.error(
                `❌ Failed to create listing for property=${property.id} status=${status}: ${err.message}`,
                err.stack,
            );
            throw new InternalServerErrorException(
                'Could not save property listing; please try again',
            );
        }
    }

    async propertyListingsBulkSave(
        propertyListings: PropertyListing[]
    ): Promise<PropertyListing[]> {
        console.log(
            `🔄 [propertyListingsBulkSave] called with ${propertyListings.length} listings…`
        );
        try {

            await this.sleep(1000);
            const saved = await this.propertyListingRepository.save(propertyListings);
            console.log(
                `✅ [propertyListingsBulkSave] succeeded, saved ${saved.length} listings.`
            );
            return saved;
        } catch (err) {
            console.error(
                `❌ [propertyListingsBulkSave] ERROR while saving ${propertyListings.length} listings:`,
                err
            );
            throw err; // rethrow so upstream can catch/log
        }
    }

 /* -------- DEALMACHINE INTEGRATIONS ------------ */

    async dealmachine(listingsExportDto: ListingsExportDto, userId: string) {
        const { ids } = listingsExportDto;

        const raws = await this.propertyListingRepository
            .createQueryBuilder('pl')
            .innerJoin('pl.property', 'p')
            .select([
                'p.id AS "propertyId"',
                'p.street_address AS "streetAddress"',
                'p.city AS "city"',
                'p.state AS "state"',
                'p.zipcode AS "zipcode"',
                'pl.status AS "status"',
            ])
            .where('pl.id IN (:...ids)', { ids })
            .getRawMany();

        interface CsvRow {
            address: string;
            city: string;
            state: string;
            zip: string;
            full_address: string;
            moverlead_property_id: string;
            listing_status: string;
        }

        const csvRows: CsvRow[] = raws.map((row) => ({
            address: row.streetAddress,
            city: row.city,
            state: (row.state || '').toUpperCase().slice(0, 2),
            zip: row.zipcode,
            full_address: `${row.streetAddress}, ${row.city}, ${row.state} ${row.zipcode}`,
            moverlead_property_id: row.propertyId,
            listing_status: row.status,
        }));

        const csvString = json2csvParse(csvRows);

        // 3️⃣ Save to file
        const csvDir = path.resolve(__dirname, '../../'); // from /src/api/properties → project root
        const csvPath = path.join(csvDir, `dealmachine-upload-${Date.now()}.csv`);

        fs.writeFileSync(csvPath, csvString, 'utf8');

        console.log(`✅ CSV saved at ${csvPath}`);

        await triggerDealmachineUpload(
            csvPath,
            process.env.DEALMACHINE_EMAIL,
            process.env.DEALMACHINE_PASSWORD
        );

        // Kick off the export automation
        const scriptExport = path.resolve(process.cwd(), 'src/puppeteer/playwright-export-dealmachine.mjs');

        await runNodeScript(scriptExport, {
            DM_EMAIL: process.env.DEALMACHINE_EMAIL,           // put creds in env, not hardcoded
            DM_PASSWORD: process.env.DEALMACHINE_PASSWORD,
        });

        setTimeout(async () => {
            console.log('📬 Triggering GmailService.poll() after delay');
            await this.gmailService.poll();
        }, 60_000); // 1 minute

        return {  message: 'DealMachine push completed and export triggered' };

       }

    async importDealmachineFromUrl(rawUrl: string){
        // 1. Validate & resolve redirect to final CSV URL
        let startUrl: string;
        try {
            startUrl = new URL(rawUrl).toString();
        } catch {
            throw new BadRequestException('Invalid URL');
        }

        const finalUrl = await this.resolveFinalUrl(startUrl); // ← your own method
        // 2. Create downloads folder if not exists
        const outputDir = path.resolve('./downloads');
        fs.mkdirSync(outputDir, { recursive: true });

        // 3. Prepare file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(outputDir, `dealmachine-${timestamp}.csv`);

        // 4. Download file using axios
        console.log('🌐 Downloading from:', finalUrl);
        const response = await axios.get(finalUrl, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'MoverLeadBot/1.0 (+axios)',
            },
            maxRedirects: 5,
            timeout: 15000,
        });

        // 5. Pipe to file
        const writer = fs.createWriteStream(filePath);
        await new Promise<void>((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', resolve as () => void); // this is also okay
            writer.on('error', reject);
        });

        console.log('✅ CSV downloaded to:', filePath);
        // 3) Read buffer for parsing
        const csvBuffer = await fsp.readFile(filePath);

        // 4) IMPORT LOGIC (your existing code, inlined)
        const text = csvBuffer.toString('utf8');

        const records: any[] = parse(text, {
            bom: true,
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        const headers = records.length ? Object.keys(records[0]) : [];

        const normalized = records.map((row) => {
            const cleanedRow: Record<string, any> = {};
            for (const key in row) {
                const cleanKey = key.trim().replace(/\s+/g, '_').toLowerCase();
                const value = typeof row[key] === 'string' ? row[key].trim() : row[key];
                cleanedRow[cleanKey] = value;
            }
            return cleanedRow;
        });

        const slim = normalized
            .map((row) => ({
                mover_lead_property_id: row.mover_lead_property_id,
                dealmachine_lead_id: row.dealmachine_lead_id,
                listing_status: row.listing_status,
                first_name: row.first_name,
                last_name: row.last_name,
                phone_1: row.phone_1 ?? '',
                phone_2: row.phone_2 ?? '',
                phone_3: row.phone_3 ?? '',
                email_address_1: row.email_address_1 ?? '',
                email_address_2: row.email_address_2 ?? '',
                email_address_3: row.email_address_3 ?? '',
            }))
            .filter((r) => r.mover_lead_property_id && r.mover_lead_property_id.trim() !== '');

        const savedDealmachineData: any[] = [];
        const newEntities: Dealmachine[] = [];

        for (const row of slim) {
            const property = await this.propertyRepository.findOne({
                where: { id: row.mover_lead_property_id },
            });
            if (!property) {
                console.warn(`Property ${row.mover_lead_property_id} not found`);
                continue;
            }

            const firstName = row.first_name?.trim().toLowerCase();
            const lastName = row.last_name?.trim().toLowerCase();
            const phoneNumber1 = row.phone_1?.trim().toLowerCase();

            // ✅ Duplicate check
            const existing = await this.dealmachineRepository.findOne({
                where: {
                    property: { id: property.id },
                    firstName,
                    lastName,
                    phoneNumber1,
                },
                relations: ['property'],
            });

            if (existing) {
                console.log(`⚠️ Skipping duplicate: ${firstName} ${lastName} for property ${property.id}`);
                continue;
            }

            const entity = this.dealmachineRepository.create({
                firstName,
                lastName,
                listingStatus: row.listing_status,
                phoneNumber1: row.phone_1,
                phoneNumber2: row.phone_2,
                phoneNumber3: row.phone_3,
                email1: row.email_address_1?.toLowerCase(),
                email2: row.email_address_2?.toLowerCase(),
                email3: row.email_address_3?.toLowerCase(),
                property,
            });

            newEntities.push(entity);
        }

// ✅ Bulk insert
        if (newEntities.length > 0) {
            const saved = await this.dealmachineRepository.save(newEntities);
            savedDealmachineData.push(...saved);
        }

        /*
        const savedDealmachineData: any[] = [];
        for (const row of slim) {
            const property = await this.propertyRepository.findOne({
                where: { id: row.mover_lead_property_id },
            });
            if (!property) {
                console.warn(`Property ${row.mover_lead_property_id} not found`);
                continue;
            }

            const firstName = row.first_name?.trim().toLowerCase();
            const lastName = row.last_name?.trim().toLowerCase();
            const phoneNumber1 = row.phone_1?.trim().toLowerCase();

*/

            /* ---------------------------------- */
            /* IMPORTING INTO DEALMACHINE ENTITY */
            /* ---------------------------------- */
/*
            const existing = await this.dealmachineRepository.findOne({
                where: {
                    property: { id: property.id },
                    firstName,
                    lastName,
                    phoneNumber1,
                },
                relations: ['property'],
            });

            if (existing) {
                console.log(`⚠️ Skipping duplicate: ${firstName} ${lastName} for property ${property.id}`);
               await axios
                    .delete(`https://api.dealmachine.com/public/v1/leads/${row.dealmachine_lead_id}`, {
                        headers: {
                            Authorization: `Bearer ${process.env.DEALMACHINE_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                    })
                    .catch((err) => console.log(err));
                continue;
            }

            const dealmachine = this.dealmachineRepository.create({
                firstName: row.first_name?.toLowerCase(),
                lastName: row.last_name?.toLowerCase(),
                listingStatus: row.listing_status,
                phoneNumber1: row.phone_1,
                phoneNumber2: row.phone_2,
                phoneNumber3: row.phone_3,
                email1: row.email_address_1?.toLowerCase(),
                email2: row.email_address_2?.toLowerCase(),
                email3: row.email_address_3?.toLowerCase(),
                property: property,
            });

            const saved = await this.dealmachineRepository.save(dealmachine);
            savedDealmachineData.push(saved);
*/
/*
            console.log('POCINJE CISCENJE: ' + row.dealmachine_lead_id);
            await axios
                .delete(`https://api.dealmachine.com/public/v1/leads/${row.dealmachine_lead_id}`, {
                    headers: {
                        Authorization: `Bearer ${process.env.DEALMACHINE_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                })
                .catch((err) => console.log(err));

            */



        /* ---------------------------------- */
        /* PHONEBURNER INTEGRATION  */
        /* ---------------------------------- */

        // Build base batch from saved records
        const baseBatch = savedDealmachineData.map((record) => {
            const property = record.property;

            return {
                moverLeadId: record.id,
                firstName: record.firstName,
                lastName: record.lastName,

                // Primary + additional emails
                email: record.email1,
                additionalEmails: [record.email2, record.email3].filter(Boolean),

                // Primary + additional phones
                phone: record.phoneNumber1,
                additionalPhones: [
                    record.phoneNumber2 ? { type: 'Work', number: record.phoneNumber2 } : null,
                    record.phoneNumber3 ? { type: 'Home', number: record.phoneNumber3 } : null,
                ].filter(Boolean),

                // Property data
                address1: property?.streetAddress ?? '',
                city: property?.city ?? '',
                state: property?.state ?? '',
                zip: property?.zip ?? '',
                country: 'US',

                // Metadata
                source: 'Dealmachine Import',
                propertyId: property?.id ?? undefined,
                tags: ['Dealmachine', property?.state ?? 'Unknown'],
            };
        });

        const ilBatch = baseBatch.filter((c) =>
            ['IL', 'IN', 'WI'].includes(c.state?.toUpperCase() ?? ''),
        );
        const dmvBatch = baseBatch.filter((c) =>
            ['DC', 'VA', 'MD'].includes(c.state?.toUpperCase() ?? ''),
        );

        if (ilBatch.length) {
            await this.uploadContactsToPhoneBurner({ region: 'IL', contacts: ilBatch });
        }
        if (dmvBatch.length) {
            await this.uploadContactsToPhoneBurner({ region: 'DMV', contacts: dmvBatch });
        }

// Optional: you could also log or return them to verify counts
        console.log(`IL Batch: ${ilBatch.length} contacts`);
        console.log(`DMV Batch: ${dmvBatch.length} contacts`);



        /* ---------------------------------- */
        /* ZEROBOUNCE INTEGRATION */
        /* ---------------------------------- */

        // ZeroBounce batch
        const emailBatch: Array<{ email_address: string }> = [];
        for (const lead of savedDealmachineData) {
            if (lead.email1) emailBatch.push({ email_address: lead.email1 });
            if (lead.email2) emailBatch.push({ email_address: lead.email2 });
            if (lead.email3) emailBatch.push({ email_address: lead.email3 });
        }

        let zeroBounceRes: any = { email_batch: [], errors: [] };
        try {
            const response = await axios.post('https://bulkapi.zerobounce.net/v2/validatebatch', {
                api_key: process.env.ZEROBOUNCE_API_KEY,
                email_batch: emailBatch,
                verify_plus: true,
            });
            zeroBounceRes = response.data;
        } catch (err: any) {
            console.error('❌ ZeroBounce API error', err.response?.status, err.response?.data || err.message);
            zeroBounceRes.errors.push(err.response?.data || err.message);
        }

        for (const result of zeroBounceRes.email_batch) {
            const email = result.address?.toLowerCase();
            if (!email) continue;

            const match = await this.dealmachineRepository.findOne({
                where: [{ email1: email }, { email2: email }, { email3: email }],
            });
            if (!match) {
                console.warn(`❌ No match found in DB for email: ${email}`);
                continue;
            }

            const updateData: any = {};
            if (match.email1?.toLowerCase() === email) updateData.email1Valid = result.status;
            if (match.email2?.toLowerCase() === email) updateData.email2Valid = result.status;
            if (match.email3?.toLowerCase() === email) updateData.email3Valid = result.status;

            await this.dealmachineRepository.update(match.id, updateData);
            const updated = await this.dealmachineRepository.findOne({
                where: {id: match.id},
                relations: ['property'],
            });



            /* ---------------------------------- */
            /* INSTANTLY INTEGRATION */
            /* ---------------------------------- */

            const campaignMap = {
                FOR_SALE: '520865cd-e1c9-42bf-a19b-a7ff2c103748',
                PENDING: '493b5df5-be2f-4146-b6fd-62e7f860904f',
            };

            const campaignId = campaignMap[updated.listingStatus as keyof typeof campaignMap];

            if (campaignId) {
                const emails = [
                    { email: updated.email1, isValid: updated.email1Valid },
                    { email: updated.email2, isValid: updated.email2Valid },
                    { email: updated.email3, isValid: updated.email3Valid },
                ];

                for (const { email, isValid } of emails) {
                    if (email && isValid === 'valid') {
                        await this.createInstantlyLead({
                            email,
                            firstName: updated.firstName,
                            lastName: updated.lastName,
                            campaignId,
                            customVars: {
                                propertyId: updated.property?.id,
                                propertyAddress: updated.property?.streetAddress,
                                fullAddress: `${updated.property?.streetAddress}, ${updated.property?.city}, ${updated.property?.state}, ${updated.property?.zipcode}` || '',
                                dealmachineId: updated.id,
                                realtor: updated.property?.realtorName || '',
                                brokerage: updated.property?.brokerageName || '',
                            },
                        });
                    }
                }
            }
        }

        // 5) Cleanup temp
        /*
        try {
            await fsp.unlink(filePath);
            await fsp.rm(tempDir, { recursive: true, force: true });
        } catch {}
*/
        // 6) Final response (plus some download metadata)
        return {
            ok: true,
            rows: slim.length,
            headersReceived: headers,
            sample: slim.slice(0, 5),
            emailsValidated: zeroBounceRes.email_batch.length,
            download: {
                finalUrl,
                bytes: csvBuffer.length,
            },
        };
    }
    private phoneBurnerHttp = axios.create({
        baseURL: 'https://www.phoneburner.com/rest/1',
        timeout: 20000,
    });

    private getPhoneBurnerAuthHeader() {
        const token = process.env.PHONEBURNER_ACCESS_TOKEN;
        if (!token) throw new Error('PHONEBURNER_ACCESS_TOKEN missing');
        return { Authorization: `Bearer ${token}` };
    }

    /** Simple API sanity ping to ensure token works */
    private async phoneBurnerHealthcheck() {
        try {
            const { data } = await this.phoneBurnerHttp.get('/tranquility', {
                headers: this.getPhoneBurnerAuthHeader(),
            });
            return data;
        } catch (err: any) {
            throw new Error('PhoneBurner connection failed: ' + (err?.message ?? String(err)));
        }
    }
    async uploadContactsToPhoneBurner(input: {
        region: 'IL' | 'DMV';
        contacts: Array<{
            moverLeadId?: string;
            firstName?: string;
            lastName?: string;
            email?: string;
            additionalEmails?: string[];
            phone?: string;
            additionalPhones?: { type: string; number: string }[];
            tags?: string[] | string;
            address1?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
            source?: string;
            propertyId?: string | number;
        }>;
    }) {
        if (!input?.contacts?.length) {
            return { ok: true, created: 0, total: 0, results: [] };
        }

        // ✅ Folder ID per region
        const folderId =
            input.region === 'IL'
                ? Number(process.env.PHONEBURNER_FOLDER_IL)
                : Number(process.env.PHONEBURNER_FOLDER_DMV);

        if (!folderId) {
            throw new Error(`Missing folder ID for region ${input.region}`);
        }

        // ✅ Healthcheck
        try {
            await this.phoneBurnerHealthcheck();
        } catch (e: any) {
            throw new Error(
                'PhoneBurner healthcheck failed: ' +
                (e?.response?.data?.error ?? e?.message ?? String(e)),
            );
        }

        const results: any[] = [];
        let created = 0;

        for (const c of input.contacts) {
            if (!c.email && !c.phone) {
                results.push({ input: c, error: true, reason: 'Missing email/phone' });
                continue;
            }

            // Build form according to API spec
            const form = new URLSearchParams({
                first_name: c.firstName ?? '',
                last_name: c.lastName ?? '',
                email: c.email ?? '',
                phone: c.phone ?? '',
                phone_type: '3', // default Cell
                address1: c.address1 ?? '',
                city: c.city ?? '',
                state: c.state ?? '',
                zip: c.zip ?? '',
                country: c.country ?? '',
                category_id: String(folderId),
                ad_code: c.source ?? 'MoverLead',
                lead_id: c.moverLeadId ?? '',
            });

            // ✅ Add additional phones
            if (c.additionalPhones?.length) {
                for (const p of c.additionalPhones) {
                    form.append('additional_phone[]', p.number);
                }
            }

            // ✅ Add additional emails as custom fields
            if (c.additionalEmails?.length) {
                for (let i = 0; i < c.additionalEmails.length; i++) {
                    form.append('custom_fields[][name]', `Email ${i + 2}`);
                    form.append('custom_fields[][type]', '1');
                    form.append('custom_fields[][value]', c.additionalEmails[i]);
                }
            }

            // ✅ Add tags
            if (c.tags) {
                const tagsArr = Array.isArray(c.tags) ? c.tags : [c.tags];
                for (const t of tagsArr) form.append('tags[]', t);
            }

            // ✅ Property ID as custom field
            if (c.propertyId) {
                form.append('custom_fields[][name]', 'Property ID');
                form.append('custom_fields[][type]', '1');
                form.append('custom_fields[][value]', String(c.propertyId));
            }

            // Duplicate handling
            form.append('on_duplicate', 'update');
            form.append('duplicate_checks[email]', 'true');
            form.append('duplicate_checks[phone]', 'true');

            let attempt = 0;
            let success = false;
            let lastErr: any;

            while (!success && attempt < 3) {
                attempt++;
                try {
                    const { data, status } = await this.phoneBurnerHttp.post('/contacts', form, {
                        headers: {
                            ...this.getPhoneBurnerAuthHeader(),
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    });

                    results.push({ input: c, status, response: data });
                    created++;
                    success = true;
                } catch (err: any) {
                    const status = err?.response?.status;
                    lastErr = err?.response?.data ?? err?.message ?? String(err);

                    if (status === 429 || (status >= 500 && status < 600)) {
                        await new Promise((r) => setTimeout(r, 400 * attempt));
                    } else break;
                }
            }

            if (!success) {
                results.push({ input: c, error: true, detail: lastErr });
            }
        }

        return { ok: true, created, total: input.contacts.length, results };
    }

/* -------------- INSTANTLY INTEGRATION ----------------*/

    async createInstantlyLead(input: {
        email: string;
        firstName?: string;
        lastName?: string;
        campaignId?: string;
        customVars?: Record<string, any>;
    }) {
        const apiKey = process.env.INSTANTLY_API_KEY;
        if (!apiKey) throw new Error('INSTANTLY_API_KEY missing');

        try {
            const payload = {
                email: input.email,
                first_name: input.firstName ?? '',
                last_name: input.lastName ?? '',
                campaign: input.campaignId ?? null,
                skip_if_in_campaign: true,
                custom_variables: input.customVars ?? {},
            };

            const { data } = await axios.post(
                'https://api.instantly.ai/api/v2/leads',
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            return { ok: true, data };
        } catch (err: any) {
            return {
                ok: false,
                error: err?.response?.data ?? err?.message ?? String(err),
            };
        }
    }
}

async function triggerDealmachineUpload(localCsvPath: string, email: string, password: string) {
    const ssh = new NodeSSH();

    const remoteHost = '184.105.4.52';
    const username = 'paperspace';
    const privateKeyPath = '/Users/milosgak/.ssh/id_rsa';
    console.log('🔑 Private key contents:', fs.readFileSync(privateKeyPath, 'utf8'));

    // 1. Create dynamic remote filename
    const timestamp = Date.now();
    const remoteFilename = `dealmachine-upload-${timestamp}.csv`;
    const remotePath = `/home/paperspace/${remoteFilename}`;

    // 2. Check local file exists
    if (!fs.existsSync(localCsvPath)) {
        throw new Error(`CSV file does not exist: ${localCsvPath}`);
    }

    // 3. Connect to Paperspace
    await ssh.connect({
        host: remoteHost,
        username,
        privateKey: fs.readFileSync(privateKeyPath, 'utf8'), // ✅ use the actual contents of the key file

    });

    // 4. Upload the CSV
    await ssh.putFile(localCsvPath, remotePath);
    console.log(`✅ Uploaded to ${remotePath}`);

    // 5. Trigger the script with env vars
    const result = await ssh.execCommand(
        `DEALMACHINE_CSV_PATH=${remotePath} DEALMACHINE_EMAIL=${email} DEALMACHINE_PASSWORD=${password} node playwright-upload.mjs`)
    // 6. Log the result
    console.log('📤 stdout:\n', result.stdout);
    console.error('❌ stderr:\n', result.stderr);

    ssh.dispose(); // Cleanup
}
