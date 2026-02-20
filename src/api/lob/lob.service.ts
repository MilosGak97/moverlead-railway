import {ForbiddenException, HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {
    Configuration,
    PostcardsApi,
    PostcardEditable,
    MailType,
    PostcardSize,
} from '@lob/lob-typescript-sdk';
import {CreatePostcardTemplateDto} from "./dto/create-postcard-template.dto";
import {PostcardTemplate} from "../../entities/postcard-template.entity";
import {PostcardTemplateRepository} from "../../repositories/postcard-template.repository";
import {UserRepository} from "../../repositories/user.repository";
import {PostCardSize} from "../../enums/postcard-size.enum";
import {SendPostcardsDto} from "./dto/send-postcards.dto";
import {PropertyListingRepository} from "../../repositories/property-listing.repository";
import {In} from "typeorm";
import {UserExtrasAccessRepository} from "../../repositories/user-extras-access.repository";
import {UserExtrasAccessType} from "../../enums/user-extras-access-type.enum";
import {PropertyHomeownerEnrichmentRepository} from "../../repositories/property-homeowner-enrichment.repository";
import {InjectQueue} from "@nestjs/bull";
import {Queue} from "bull";
import {SendPostcardJobDto, ToAddressDto} from "./dto/send-postcard.dto";
import {UserTokenService} from "../user-token/user-token.service";
import {GetPostcardsOverviewDto} from "./dto/get-postcards-overview.dto";
import {GetPostcardsPaginatedDto} from "./dto/get-postcards-paginated.dto";
import {PostcardsPaginatedResponseDto} from "./dto/postcards-paginated-response.dto";
import {PostcardListItemDto} from "./dto/postcard-list-item.dto";
import {PostcardTrackingStatus} from "./enums/postcard-tracking-status.enum";


@Injectable()
export class LobService {
    private readonly apiKey = process.env.LOB_API_KEY;
    private config = new Configuration({username: this.apiKey});
    private api = new PostcardsApi(this.config);

    constructor(
        private readonly postcardTemplateRepository: PostcardTemplateRepository,
        private readonly userRepository: UserRepository,
        private readonly propertyLstingRepository: PropertyListingRepository,
        private readonly userExtrasAccessRepository: UserExtrasAccessRepository,
        private readonly propertyHomeownerEnrichmentRepository: PropertyHomeownerEnrichmentRepository,
        private readonly userTokenService: UserTokenService,

        @InjectQueue('postcards')
        private readonly postcardsQueue: Queue,
    ) {
    }


    async createPostcardTemplate(
        createDto: CreatePostcardTemplateDto,
        userId: string,
    ): Promise<PostcardTemplate> {
        const user = await this.userRepository.findOneOrFail({where: {id: userId}})
        if (!user) {
            throw new HttpException("User is not found with provided id", HttpStatus.BAD_REQUEST)
        }
        const entity = this.postcardTemplateRepository.create({
            ...createDto,
            user,
        });

        return await this.postcardTemplateRepository.save(entity);
    }


    async fetchPostcardTemplate(sizes: PostCardSize[] | undefined, userId: string): Promise<PostcardTemplate[]> {
        const sizeList = Array.isArray(sizes) ? sizes : sizes ? [sizes] : [];
        const normalizedLower = sizeList.map((size) =>
            typeof size === 'string' ? (size.toLowerCase() as PostCardSize) : size,
        );

        const whereClause: any = { user: { id: userId } };
        if (normalizedLower.length) {
            whereClause.size = In(normalizedLower);
        }

        return this.postcardTemplateRepository.find({ where: whereClause });
    }

    async deletePostcardTemplate(id: string, userId: string) {
        const template = await this.postcardTemplateRepository.findOne({
            where: { id, user: { id: userId } },
        });

        if (!template) {
            throw new HttpException('Postcard template not found', HttpStatus.NOT_FOUND);
        }

        await this.postcardTemplateRepository.remove(template);

        return { message: 'Postcard template deleted' };
    }

    async sendPostcards(dto: SendPostcardsDto, userId: string) {
        const user = await this.userRepository.findOneOrFail({ where: { id: userId } });

        const template = await this.postcardTemplateRepository.findOneOrFail({
            where: { id: dto.postcardTemplateId, user: { id: userId } },
        });

        const listings = await this.propertyLstingRepository.find({
            where: { id: In(dto.listingIds) },
            relations: ['property'],
        });

        const results = [];

        const listingsCount = listings.length;
        let costPerPiece;
        const sizeLower = template.size?.toLowerCase();
        if(sizeLower == '6x9' && dto.postcardShippingType == 'usps_first_class'){
            costPerPiece = 0.85
        }

        if(sizeLower == '6x11' && dto.postcardShippingType == 'usps_first_class'){
            costPerPiece = 1.12
        }

        if(sizeLower == '6x9' && dto.postcardShippingType == 'usps_standard'){
            costPerPiece = 0.83
        }

        if(sizeLower == '6x11' && dto.postcardShippingType == 'usps_standard'){
            costPerPiece = 0.91
        }

        const totalCost = costPerPiece * listingsCount;
        if (
            totalCost > 0 &&
            !(await this.userTokenService.checkBalance(userId, totalCost))
        ) {
            const balance = await this.userTokenService.getBalance(userId);
            throw new ForbiddenException(
                `Need ${totalCost} tokens; you have ${balance}`,
            );
        }

        await this.userTokenService.deduct(
            userId,
            totalCost,
        );

        for (const listing of listings) {
            const property = listing.property;

            if (!property) {
                throw new HttpException(`Listing ${listing.id} is missing a related property`, HttpStatus.BAD_REQUEST);
            }

            // Check if user has access to homeowner name
            const hasHomeownerAccess = await this.userExtrasAccessRepository.findOne({
                where: {
                    user: { id: userId },
                    property: { id: property.id },
                    accessType: UserExtrasAccessType.HOMEOWNER_ENRICHMENT,
                },
            });

            let recipientName = 'Current Resident';

            if (hasHomeownerAccess) {
                const enrichment = await this.propertyHomeownerEnrichmentRepository.findOne({
                    where: { property: { id: property.id } },
                });

                const isCommercial = enrichment?.isCommercial === true;

                if (!isCommercial) {
                    const firstName = enrichment?.ownerFirstName?.trim() ?? '';
                    const lastName = enrichment?.ownerLastName?.trim() ?? '';
                    const fullName = `${firstName} ${lastName}`.trim();

                    if (fullName) {
                        const potentialName = `${fullName} or Current Resident`;
                        recipientName = potentialName.length > 40 ? 'Current Resident' : potentialName;
                    }
                }
            }


            if (!user.address || !user.city || !user.state || !user.zip) {
                throw new HttpException('User does not have a valid mailing address set', HttpStatus.BAD_REQUEST);
            }


// Create ToAddressDto instance
            const toAddress = new ToAddressDto();
            toAddress.name = recipientName;
            toAddress.address_line1 = property.streetAddress;
            toAddress.address_city = property.city;
            toAddress.address_state = property.state;
            toAddress.address_zip = property.zipcode;

// Create SendPostcardJobDto instance
            const postcardPayload = new SendPostcardJobDto();
            postcardPayload.listingId = listing.id;
            postcardPayload.propertyId = property.id;
            postcardPayload.userId = userId;
            postcardPayload.postcardTemplateId = dto.postcardTemplateId;
            postcardPayload.shippingType = dto.postcardShippingType;
            postcardPayload.recipientName = recipientName;
            postcardPayload.toAddress = toAddress;
            postcardPayload.frontUrl = template.frontUrl;
            postcardPayload.backUrl = template.backUrl;
            postcardPayload.size = template.size.toLowerCase();

            await this.postcardsQueue.add('sendOnePostcard', postcardPayload);

            results.push({
                listingId: listing.id,
                propertyId: property.id,
                status: 'queued',
            });
        }

        return {
            enqueued: results.length,
            details: results,
        };
    }

    async listUserPostcards(
        query: GetPostcardsOverviewDto,
        userId: string,
    ) {
        if (query.startDate && query.endDate) {
            const start = new Date(query.startDate);
            const end = new Date(query.endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                throw new HttpException('Invalid date range', HttpStatus.BAD_REQUEST);
            }
            if (start > end) {
                throw new HttpException('startDate must be before endDate', HttpStatus.BAD_REQUEST);
            }
        }

        const metadataFilter: Record<string, string> = {
            'Company ID': userId,
        };

        const templateIdsFilter = query.postcardTemplateIds
            ? (Array.isArray(query.postcardTemplateIds)
                ? query.postcardTemplateIds
                : [query.postcardTemplateIds])
            : undefined;

        const templateIds = templateIdsFilter
            ?.map((id) => (typeof id === 'string' ? id.trim() : id))
            .filter(Boolean);

        if (templateIds?.length === 1) {
            metadataFilter['Postcard Template ID'] = templateIds[0];
        }

        const statesFilter = query.states
            ? (Array.isArray(query.states) ? query.states : [query.states])
            : undefined;

        if (statesFilter?.length === 1) {
            metadataFilter.State = statesFilter[0];
        }

        const dateCreated: Record<string, string> = {};
        if (query.startDate) {
            dateCreated.gte = query.startDate;
        }
        if (query.endDate) {
            dateCreated.lte = query.endDate;
        }

        const sizeFilter = this.normalizeLobSizes(query.postcardSizes);

        const mailType = query.mailType as unknown as MailType | undefined;

        const normalizedStates = statesFilter?.map((state) =>
            state.trim().toUpperCase(),
        );
        const templateIdSet = templateIds?.length ? new Set(templateIds) : undefined;

        const perDayCounts: Record<string, number> = {};
        let total = 0;

        let afterToken: string | undefined = undefined;
        const pageSize = 100; // Lob max per page

        // Paginate through Lob list results and aggregate counts per day
        while (true) {
            const lobList = await this.api.list(
                pageSize,
                undefined,
                afterToken,
                undefined,
                Object.keys(dateCreated).length ? dateCreated : undefined,
                metadataFilter,
                sizeFilter,
                undefined,
                undefined,
                mailType,
            );

            const {data: lobData = []} = lobList as any;

            for (const item of lobData) {
                if (templateIdSet?.size) {
                    const metaTemplateId = (item.metadata?.['Postcard Template ID'] || '').trim();
                    if (!metaTemplateId || !templateIdSet.has(metaTemplateId)) {
                        continue;
                    }
                }

                if (normalizedStates?.length) {
                    const metaState = (
                        item.metadata?.State ||
                        item.to?.address_state ||
                        ''
                    ).toUpperCase();

                    if (!normalizedStates.includes(metaState)) {
                        continue;
                    }
                }

                const created = item.date_created as string | undefined;
                if (!created) {
                    continue;
                }

                const dayKey = created.slice(0, 10);
                perDayCounts[dayKey] = (perDayCounts[dayKey] ?? 0) + 1;
                total += 1;
            }

            const nextToken = (lobList as any).nextPageToken as string | undefined;
            afterToken = nextToken;

            if (!nextToken) {
                break;
            }
        }

        const dayEntries: Array<{ date: string; count: number }> = [];
        if (query.startDate && query.endDate) {
            const cursor = new Date(query.startDate);
            const endDate = new Date(query.endDate);
            while (cursor <= endDate) {
                const key = cursor.toISOString().slice(0, 10);
                dayEntries.push({date: key, count: perDayCounts[key] ?? 0});
                cursor.setDate(cursor.getDate() + 1);
            }
        } else {
            const sortedKeys = Object.keys(perDayCounts).sort();
            for (const key of sortedKeys) {
                dayEntries.push({date: key, count: perDayCounts[key]});
            }
        }

        return {
            total,
            days: dayEntries,
        };
    }

    async getPostcardDetail(postcardId: string, userId: string) {
        // Ensure this postcard belongs to the user via metadata match
        const postcard = await this.api.get(postcardId);
        const companyId = postcard.metadata?.['Company ID'];

        if (companyId !== userId) {
            throw new ForbiddenException('Postcard does not belong to this user');
        }

        const recipient = {
            name: postcard.to?.name || postcard.to?.company || '',
            addressLine1: postcard.to?.address_line1 || '',
            city: postcard.to?.address_city || '',
            state: postcard.to?.address_state || '',
            zip: postcard.to?.address_zip || '',
            country: postcard.to?.address_country || '',
        };

        const thumbnails = postcard.thumbnails?.map((t: any) => ({
           large: t.large ?? null,
        })) ?? [];

        const trackingEvents =
            postcard.tracking_events?.map((ev: any) => ({
                id: ev.id,
                dateCreated: ev.date_created,
                dateModified: ev.date_modified,
                object: ev.object,
                type: ev.type,
                name: ev.name,
                time: ev.time,
                status: ev.status,
                location: ev.location ?? null,
                details: ev.details ?? null,
            })) ?? null;

        const trackingStatus: PostcardTrackingStatus =
            trackingEvents && trackingEvents.length
                ? PostcardTrackingStatus.Mailed
                : PostcardTrackingStatus.InProduction;

        return {
            id: postcard.id,
            thumbnails,
            recipient,
            size: postcard.size,
            mailType: postcard.mail_type as any,
            dateCreated: postcard.date_created,
            sendDate: postcard.send_date ?? null,
            expectedDeliveryDate: postcard.expected_delivery_date ?? null,
            description: postcard.description ?? null,
            qrCodeUrl: (postcard as any).qr_code?.redirect_url ?? null,
            trackingEvents,
            trackingStatus,
        };
    }

    async listUserPostcardsPaginated(
        query: GetPostcardsPaginatedDto,
        userId: string,
    ): Promise<PostcardsPaginatedResponseDto> {
        const limit = query.limit ?? 20;
        const offset = query.offset ?? 0;

        if (query.startDate && query.endDate) {
            const start = new Date(query.startDate);
            const end = new Date(query.endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                throw new HttpException('Invalid date range', HttpStatus.BAD_REQUEST);
            }
            if (start > end) {
                throw new HttpException('startDate must be before endDate', HttpStatus.BAD_REQUEST);
            }
        }

        const metadataFilter: Record<string, string> = {
            'Company ID': userId,
        };

        const templateIdsFilter = query.postcardTemplateIds
            ? (Array.isArray(query.postcardTemplateIds)
                ? query.postcardTemplateIds
                : [query.postcardTemplateIds])
            : undefined;

        const templateIds = templateIdsFilter
            ?.map((id) => (typeof id === 'string' ? id.trim() : id))
            .filter(Boolean);

        if (templateIds?.length === 1) {
            metadataFilter['Postcard Template ID'] = templateIds[0];
        }

        const statesFilter = query.states
            ? (Array.isArray(query.states) ? query.states : [query.states])
            : undefined;

        if (statesFilter?.length === 1) {
            metadataFilter.State = statesFilter[0];
        }

        const sendDate: Record<string, string> = {};
        if (query.startDate) {
            sendDate.gte = query.startDate;
        }
        if (query.endDate) {
            sendDate.lte = query.endDate;
        }

        const sizeFilter = this.normalizeLobSizes(query.postcardSizes);

        const mailType = query.mailType as unknown as MailType | undefined;

        const normalizedStates = statesFilter?.map((state) =>
            state.trim().toUpperCase(),
        );
        const templateIdSet = templateIds?.length ? new Set(templateIds) : undefined;

        const items: PostcardListItemDto[] = [];
        let matchingIndex = 0;
        let totalRecords = 0;

        let afterToken: string | undefined = undefined;
        const pageSize = 100; // Lob max per page

        // Walk all pages to support accurate total and offset pagination
        while (true) {
            const lobList = await this.api.list(
                pageSize,
                undefined,
                afterToken,
                undefined,
                undefined,
                metadataFilter,
                sizeFilter,
                undefined,
                Object.keys(sendDate).length ? sendDate : undefined,
                mailType,
            );

            const {data: lobData = []} = lobList as any;

            for (const item of lobData) {
                if (templateIdSet?.size) {
                    const metaTemplateId = (item.metadata?.['Postcard Template ID'] || '').trim();
                    if (!metaTemplateId || !templateIdSet.has(metaTemplateId)) {
                        continue;
                    }
                }

                if (normalizedStates?.length) {
                    const metaState = (
                        item.metadata?.State ||
                        item.to?.address_state ||
                        ''
                    ).toUpperCase();

                    if (!normalizedStates.includes(metaState)) {
                        continue;
                    }
                }

                const createdOrSend = item.send_date || item.date_created;
                if (!createdOrSend) {
                    continue;
                }

                if (matchingIndex >= offset && items.length < limit) {
                    const thumb =
                        item.thumbnails?.[0]?.medium ||
                        item.thumbnails?.[0]?.small ||
                        item.thumbnails?.[0]?.large ||
                        null;

                    items.push({
                        id: item.id,
                        thumbnail: thumb,
                        recipient: item.to?.name || '',
                        sendDate: createdOrSend,
                        size: item.size,
                        mailClass: item.mail_type as any,
                        description: item.description ?? null,
                    });
                }

                matchingIndex += 1;
                totalRecords += 1;
            }

            const nextToken = (lobList as any).nextPageToken as string | undefined;
            afterToken = nextToken;

            if (!nextToken) {
                break;
            }
        }

        const totalPages = Math.ceil(totalRecords / limit);

        return {
            result: items,
            totalRecords,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages,
            limit,
            offset,
        };
    }


    /*
    async sendPostcards(dto: SendPostcardsDto, userId: string) {

        const user = await this.userRepository.findOneOrFail({where: {id: userId}});

        const template = await this.postcardTemplateRepository.findOneOrFail({
            where: {id: dto.postcardTemplateId, user: {id: userId}},
        });


        const listings = await this.propertyLstingRepository.find({
            where: {id: In(dto.listingIds)},
            relations: ['property'], // Ensure property relation is loaded
        });

        const results = [];


        for (const listing of listings) {

            const property = listing.property;

            if (!property) {
                throw new HttpException(`Listing ${listing.id} is missing a related property`, HttpStatus.BAD_REQUEST);
            }

            // Check if user has access to homeowner name
            const hasHomeownerAccess = await this.userExtrasAccessRepository.findOne({
                where: {
                    user: {id: userId},
                    property: {id: property.id},
                    accessType: UserExtrasAccessType.HOMEOWNER_ENRICHMENT,
                },
            });

            let recipientName = 'Current Resident';

            if (hasHomeownerAccess) {
                const enrichment = await this.propertyHomeownerEnrichmentRepository.findOne({
                    where: { property: { id: property.id } },
                });

                // If it's commercial, skip using the name
                const isCommercial = enrichment?.isCommercial === true;

                if (!isCommercial) {
                    const firstName = enrichment?.ownerFirstName?.trim() ?? '';
                    const lastName = enrichment?.ownerLastName?.trim() ?? '';
                    const fullName = `${firstName} ${lastName}`.trim();

               if (fullName) {
                        const potentialName = `${fullName} or Current Resident`;
                        recipientName = potentialName.length > 40 ? 'Current Resident' : potentialName;
                    }
                }
            }

            const toAddress = {
                name: recipientName,
                address_line1: listing.property.streetAddress,
                address_city: listing.property.city,
                address_state: listing.property.state,
                address_zip: listing.property.zipcode,
            };

            if (!user.address || !user.city || !user.state || !user.zip) {
                throw new HttpException('User does not have a valid mailing address set', HttpStatus.BAD_REQUEST);
            }


            const postcardData = new PostcardEditable({
                to: toAddress,
                front: template.frontUrl,
                back: template.backUrl,
                size: template.size.toLowerCase(), // if supported by your create() call
                use_type: 'marketing',
                mail_type: dto.postcardShippingType, // 'firstclass' or 'standard'
            });

            const lobResponse = await this.api.create(postcardData); // Assuming injected `lobPostcardApi`
            results.push({
                listingId: listing.id,
                propertyId: property.id,
                nameUsed: recipientName,
                lobId: lobResponse.id,
                status: 'sent',
            });

        }

        return {sent: results.length, details: results};
    }
    */


    async sendOnePostcard(payload: SendPostcardJobDto): Promise<void> {
        const {
            toAddress,
            frontUrl,
            backUrl,
            size,
            shippingType,
            userId,
            listingId,
            propertyId,
            recipientName,
            postcardTemplateId,
        } = payload;

        // (Optional safety check, even if already done before queuing)
        if (
            !toAddress.address_line1 ||
            !toAddress.address_city ||
            !toAddress.address_state ||
            !toAddress.address_zip
        ) {
            throw new HttpException('Invalid recipient address', HttpStatus.BAD_REQUEST);
        }

        const metadata: Record<string, string> = {
            'Company ID': userId,
            'Postcard Template ID': postcardTemplateId,
        };

        if (toAddress.address_state) {
            metadata.State = toAddress.address_state;
        }

        const postcardData = new PostcardEditable({
            to: toAddress,
            front: frontUrl,
            back: backUrl,
            size: size,
            use_type: 'marketing',
            mail_type: shippingType,
            metadata,
        });

        const lobResponse = await this.api.create(postcardData);

        // You can optionally log/store this somewhere
        // (Or return lobResponse if you want to save it elsewhere)
        console.log(`📬 Lob postcard sent: ${lobResponse.id} (listingId: ${listingId})`);
    }

    private normalizeLobSizes(
        raw?: PostcardSize | PostcardSize[] | string | string[],
    ): PostcardSize[] | undefined {
        if (!raw) {
            return undefined;
        }

        const allowedValues: PostcardSize[] = [
            PostcardSize._4x6,
            PostcardSize._6x9,
            PostcardSize._6x11,
        ];
        const isAllowed = (val: string): val is PostcardSize =>
            allowedValues.includes(val as PostcardSize);

        const values = Array.isArray(raw) ? raw : [raw];

        const normalized = values
            .map((val) => (typeof val === 'string' ? val.toLowerCase() : val))
            .filter((val): val is PostcardSize => isAllowed(val as string));

        return normalized.length ? normalized : undefined;
    }

}
