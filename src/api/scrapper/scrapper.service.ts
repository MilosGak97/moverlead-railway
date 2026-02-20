import {BadRequestException, forwardRef, HttpException, HttpStatus, Inject, Injectable, Logger} from "@nestjs/common";
import {generateRandomKey} from "../common/utils/genereate-random-key";
import {DynamoDBService} from "../aws/services/dynamo-db.service";
import {S3Service} from "../aws/services/s3.service";
import {HttpsProxyAgent} from "https-proxy-agent";
import {firstValueFrom} from "rxjs";
import {HttpService} from "@nestjs/axios";
import {PropertiesService} from "../properties/properties.service";
import {ReadyScrapperResponseDto} from "../aws/dto/ready-scrapper-response.dto";
import {County} from "../../entities/county.entity";
import {CreatePropertyDto} from "../properties/dto/create-property.dto";
import {PropertyStatus} from "../../enums/property-status.enum";
import {Property} from "../../entities/property.entity";
import {PropertyListing} from "../../entities/property-listing.entity";
import {InjectQueue} from "@nestjs/bull";
import {Queue} from "bull";
import {Cron} from "@nestjs/schedule";
import {BrightdataService} from "./brightdata.service";
import {BrightdataVersion} from "../../enums/brightdata-version.enum";

@Injectable()
export class ScrapperService {
    private readonly logger = new Logger(ScrapperService.name);

    constructor(
        private readonly dynamoDBService: DynamoDBService,
        public readonly s3Service: S3Service,
        private readonly httpService: HttpService,
        private readonly brightdataService: BrightdataService,
        @Inject(forwardRef(() => PropertiesService))
        private readonly propertiesService: PropertiesService,
        @InjectQueue("scrapper") private readonly scrapperQueue: Queue
    ) {
    }

    async enqueueScrapJob(initialScrapper: boolean, options?: { useZillowCounties?: boolean }) {
        const dto = {
            initialScrapper,
            ...(options?.useZillowCounties ? { useZillowCounties: true } : {}),
        };
        const job = await this.scrapperQueue.add('scrapJob', dto);
        this.logger.log(`Scrap job enqueued with initialScrapper=${initialScrapper}, useZillowCounties=${options?.useZillowCounties ?? false}, job ID: ${job.id}`);
        return job;
    }

    @Cron('10 5 * * *') // 05:10 UTC → 07:10 Serbia
    async scheduleDailyScrapJob() {
        if (process.env.DISABLE_CRON === 'true') {
            return;
        }

        try {
            await this.enqueueScrapJob(false); // Always pass false here for daily
        } catch (error) {
            this.logger.error('Failed to enqueue daily scrap job', error.stack);
        }
    }

    // THIS EXECUTE FIRST! MAIN ONE
    // this will execute scrapper that will pull all active counties from stripe
    // then it will foreach const of array of counties to triggerScrapper()
    async runScrapperV2(initialScrapper: boolean) {
        this.logger.log('runScrapperV2 called.');
        const counties: County[] = await this.propertiesService.getAllActiveCounties();
        this.logger.log(`runScrapperV2 loaded ${counties.length} active counties`);
        await this.runScrapperForCountiesList(counties, initialScrapper);
    }

    async runScrapperForZillowCounties(initialScrapper: boolean) {
        this.logger.log('runScrapperForZillowCounties called.');
        const counties: County[] = await this.propertiesService.getCountiesWithZillowData();
        await this.runScrapperForCountiesList(counties, initialScrapper);
    }

    private parseZillowDefineInput(defineInput: any, countyId: string): any[] | null {
        let parsed = defineInput;

        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
            } catch (error) {
                console.error('💥 Failed to parse zillowDefineInput for county:', countyId);
                console.error('💥 Raw input was:', defineInput);
                return null;
            }
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
            this.logger.warn(`⚠️ County ${countyId} has empty or invalid zillowDefineInput, skipping.`);
            return null;
        }

        return parsed;
    }

    private async runScrapperForCountiesList(counties: County[], initialScrapper: boolean) {
        if (!counties || counties.length === 0) {
            throw new BadRequestException("No counties data was found from active subscriptions");
        }

        for (const county of counties) {
            if (!county.zillowLink) {
                this.logger.warn(`Skipping county ${county.id} - missing zillowLink`);
                continue;
            }

            const parsedDefineInput = this.parseZillowDefineInput(county.zillowDefineInput, county.id);
            if (!parsedDefineInput) {
                continue;
            }

            await this.triggerScrapper(county.zillowLink, parsedDefineInput, county.id, initialScrapper);
        }
    }
    @Cron('0 * * * *') // Runs at minute 0 of every hour (UTC)
    async cronBrightdata(){
       if (process.env.DISABLE_CRON === 'true') {
           return;
       }

       const result = await this.brightdataService.brightdataEnrichmentTrigger(BrightdataVersion.BRIGHTDATA_DATASET_ID_V2)+'.json'

        // Add to queue with 25-minute delay
        await this.scrapperQueue.add(
            'follow-up',
            { result },
            { delay: 25 * 60 * 1000 } // 25 minutes
        );

        console.log(`Scheduled follow-up for ${result} in 25 minutes`);
    }

    async chicagoScrapper(initialScrapper: boolean) {
        const counties: County[] = await this.propertiesService.getChicagoCounties();
        if (!counties) {
            throw new HttpException('Counties are not found', HttpStatus.BAD_REQUEST)
        }

        for (const county of counties) {
            await this.triggerScrapper(county.zillowLink, county.zillowDefineInput, county.id, initialScrapper)
        }
    }

    // feed it with:
    // county.zillowLink (single string)
    // county.zillowDefineInput (array of objects)
    // county.id (uuid)
    // initialScrapper (boolean)
    async triggerScrapper(zillowLink: string, zillowDefineInput: any, countyId: string, initialScrapper: boolean) {
        if (Array.isArray(zillowDefineInput) && zillowDefineInput.length > 0) {
            // Process each Zillow URL
            for (const item of zillowDefineInput) {
                const key: string = await generateRandomKey();
              //  this.logger.log(`Processing URL with key: ${key}`);

                await this.dynamoDBService.startedScrapperDynamo(key, countyId, zillowLink, item.minPrice.toString(), item.maxPrice.toString(), initialScrapper);

                if (!item.minPrice || !item.maxPrice) {
                    continue
                }
                // Define input data from Zillow link and headers
                const inputData = await this.defineInputData(zillowLink, Number(item.minPrice), Number(item.maxPrice));
                const headers = await this.defineHeaders();

                try {
                    // Using the datacenter proxy for the main run
                    const proxyUrl = "http://brd-customer-hl_104fb85c-zone-residential_proxy1:qf2a0h0fhx4d@brd.superproxy.io:33335";
                    const proxyAgent = new HttpsProxyAgent(proxyUrl);
                    const axiosConfig: any = {
                        headers,
                        httpsAgent: proxyAgent,
                        proxy: false,
                    };

                   // this.logger.log(`Making HTTP request to Zillow for ${zillowLink}`);
                    const response = await firstValueFrom(
                        this.httpService.put(
                            "https://www.zillow.com/async-create-search-page-state",
                            inputData,
                            axiosConfig
                        )
                    );

                    const results = response.data?.cat1?.searchResults?.mapResults;
                    this.logger.log(`Received ${results.length} results for ${zillowLink}`);

                    await this.dynamoDBService.successfulScrapper(key, results.length);
                    await this.s3Service.uploadResults(results, key);


                } catch (error) {
                    this.logger.error(`Error processing URL ${zillowLink}`, error.stack);
                    const errorInfo = {
                        zillowUrl: zillowLink,
                        inputData,
                        headers,
                        errorMessage: error.message,
                        errorStack: error.stack,
                        errorResponse: error.response
                            ? {
                                status: error.response.status,
                                statusText: error.response.statusText,
                                data: error.response.data,
                                headers: error.response.headers,
                            }
                            : null,
                        errorConfig: error.config,
                        timestamp: new Date().toISOString(),
                    };

                    await this.dynamoDBService.failedScrapper(key);
                    await this.s3Service.uploadErrorToS3(errorInfo, countyId, key);
                    // Instead of returning, log and continue to process remaining items
                }
                // Instead of returning, log and continue to process remaining items
                const minDelay = 500;   // 0.5 s
                const maxDelay = 2000;  // 2 s
                const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                this.logger.log(`⏱ waiting ${randomDelay}ms before next request`);
                await new Promise(res => setTimeout(res, randomDelay));
            }
        }
    }

    async runFailedScrapper(initialScrapper: boolean, proxyType: 'datacenter' | 'residential' = 'datacenter') {
        this.logger.log(`runFailedScrapper called with proxyType: ${proxyType}`);
        const failedZillowData = await this.dynamoDBService.checkFailedScrapper();
        this.logger.log(`Found ${failedZillowData.length} failed items to reprocess.`);
        for (const item of failedZillowData) {
            this.logger.log(`Reattempting failed item with key: ${item.s3Key} using ${proxyType} proxy.`);
            await this.executeScrapper(item.zillowUrl, Number(item.minPrice), Number(item.maxPrice), item.countyId, item.s3Key, proxyType, initialScrapper);
        }
    }
/*
    async fetchDataBatch(initialScrapper: boolean) {
        const queue = new PQueue({ concurrency: 5 });

        const readyDataKey: ReadyScrapperResponseDto[] = await this.dynamoDBService.checkReadyScrapper(initialScrapper);

        if (readyDataKey.length === 0) {
            return 'There is no ready data found.';
        }

        console.log(`There are ${readyDataKey.length} snapshots ready.`);

        const batchSize = 20;

        for (let i = 0; i < readyDataKey.length; i += batchSize) {
            const batch = readyDataKey.slice(i, i + batchSize);

            await Promise.all(
                batch.map(item =>
                    queue.add(async () => {
                        try {
                            const data = await this.s3Service.readResults(item.s3Key);
                            await this.readRawData(data, item.countyId, initialScrapper, item.date);
                            await this.dynamoDBService.markAsDone(item.s3Key);
                        } catch (err) {
                            this.logger.error(`Failed to process ${item.s3Key}: ${err.message}`);
                        }
                    })
                )
            );
        }
    }
*/
    // PRIVATE UTILS HELPERS
    // This method now accepts a proxyType parameter to select which proxy to use
    private async executeScrapper(
        zillowLink: string,
        minPrice: number,
        maxPrice: number,
        countyId: string,
        key: string,
        proxyType: 'datacenter' | 'residential' = 'datacenter',
        initialScrapper: boolean
    ) {
        this.logger.log(`executeScrapper called for ${zillowLink} using ${proxyType} proxy.`);
        const inputData = await this.defineInputData(zillowLink, minPrice, maxPrice);
        const headers = await this.defineHeaders();

        await this.dynamoDBService.updateAttemptCount(key);
        let proxyUrl: string;
        if (proxyType === 'residential') {
            proxyUrl = "http://brd-customer-hl_104fb85c-zone-residential_proxy1:qf2a0h0fhx4d@brd.superproxy.io:33335";
        } else {
            proxyUrl = "http://brd-customer-hl_104fb85c-zone-datacenter_proxy1:6yt7rqg6ryxk@brd.superproxy.io:33335";
        }

        try {
            const proxyAgent = new HttpsProxyAgent(proxyUrl);
            const axiosConfig: any = {
                headers,
                httpsAgent: proxyAgent,
                proxy: false,
            };

            this.logger.log(`Making HTTP request to Zillow for ${zillowLink} using ${proxyType} proxy.`);
            const response = await firstValueFrom(
                this.httpService.put(
                    "https://www.zillow.com/async-create-search-page-state",
                    inputData,
                    axiosConfig
                )
            );

            const results = response.data?.cat1?.searchResults?.mapResults;
            this.logger.log(`Received ${results.length} results for ${zillowLink}`);

            await this.dynamoDBService.successfulScrapper(key, results.length);
            await this.s3Service.uploadResults(results, key);
        } catch (error) {
            this.logger.error(`Error reprocessing URL ${zillowLink}`, error.stack);
            const errorInfo = {
                zillowLink,
                minPrice,
                maxPrice,
                inputData,
                headers,
                errorMessage: error.message,
                errorStack: error.stack,
                errorResponse: error.response
                    ? {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        data: error.response.data,
                        headers: error.response.headers,
                    }
                    : null,
                errorConfig: error.config,
                timestamp: new Date().toISOString(),
            };

            await this.dynamoDBService.failedScrapper(key);
            await this.s3Service.uploadErrorToS3(errorInfo, countyId, key);
        }
        const minDelay = 500;   // 0.5 s
        const maxDelay = 2000;  // 2 s
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        this.logger.log(`⏱ waiting ${randomDelay}ms before next request`);
        await new Promise(res => setTimeout(res, randomDelay));
    }

    //daily
    /*
    async readRawData2(
        data: any[],
        countyId: string,
        initialScrapper: boolean,
        date: Date,
    ) {
        // 1) Load county once
        const county = await this.propertiesService.getCountyById(countyId);

        // 2) Filter & dedupe valid zpids
        const validItems = data.filter(
            item => item.zpid && item.zpid !== 'undefined'
        );
        const zpids = Array.from(
            new Set(validItems.map(item => item.zpid.toString()))
        );
        if (!zpids.length) return;

        console.log("zpids.length", zpids.length)
        // 3) Bulk-load all existing properties
        const existingProperties: Property[] = await this.propertiesService.findByZpids(zpids);
        const existingPropertiesMap = new Map<string, Property>(
            existingProperties.map(property => [property.zpid.toString(), property]),
        );

        // 4) Prepare your status map once
        const statusMap: Record<string, PropertyStatus> = {
            Pending: PropertyStatus.PENDING,
            ComingSoon: PropertyStatus.COMING_SOON,
            ForSale: PropertyStatus.FOR_SALE,
        };
        // 5) Process sequentially, one rawItem at a time
        for (const rawItem of validItems) {
            try {
            const zpid = rawItem.zpid.toString();
            console.log("rawItem.zpid.toString()", zpid);
            let property = existingPropertiesMap.get(zpid);
                if (property) {

                    console.log('property.id', property.id)
                    // – existing property: check for status changes
                    const result = await this.propertiesService.checkPropertyDaily(
                        property,
                        rawItem.rawHomeStatusCd,
                        initialScrapper,
                        date,
                        rawItem,
                    );

                    if (result?.savedListingProperty && property.county?.id) {
                        await this.propertiesService.grantBulkListingAccessToSubscribedUsers(
                            result.savedListingProperty
                        );
                    }
                } else {
                    // – brand new property: create it
                    const dto = new CreatePropertyDto();
                    dto.zpid              = zpid;
                    dto.county           = county;
                    dto.initialScrape    = initialScrapper;
                    if (initialScrapper) {
                        dto.initialScrapeStatus = statusMap[rawItem.rawHomeStatusCd];
                    }
                    dto.streetAddress    = rawItem.hdpData.homeInfo.streetAddress;
                    dto.zipcode          = rawItem.hdpData.homeInfo.zipcode;
                    dto.city             = rawItem.hdpData.homeInfo.city;
                    dto.state            = rawItem.hdpData.homeInfo.state;
                    dto.bedrooms         = Number(rawItem.hdpData.homeInfo.bedrooms.toFixed(2));
                    dto.bathrooms        = Number(rawItem.hdpData.homeInfo.bathrooms.toFixed(2));
                    dto.price            = Number(rawItem.hdpData.homeInfo.price.toFixed(2));
                    dto.homeType         = rawItem.hdpData.homeInfo.homeType;
                    dto.brokerageName    = rawItem.brokerName;
                    dto.longitude        = rawItem.hdpData.homeInfo.longitude;
                    dto.latitude         = rawItem.hdpData.homeInfo.latitude;
                    dto.livingAreaValue  = rawItem.hdpData.homeInfo.livingArea;
                    dto.timeOnZillow     = rawItem.timeOnZillow;

                    property = await this.propertiesService.createProperty(dto);

                    // create the listing if applicable
                    const ps = statusMap[rawItem.rawHomeStatusCd];
                    if (ps) {
                        const savedListing = await this.propertiesService.createPropertyListing(
                            property,
                            ps,
                            date,
                        );
                        if (!initialScrapper && savedListing) {
                            await this.propertiesService.grantBulkListingAccessToSubscribedUsers(
                                savedListing
                            );
                        }
                    }
                }
            } catch (err) {
                this.logger.error(
                    `🚨 Error processing : ${err.message}`,
                );
                // Optionally continue or break, depending on how you want to handle failures
            }
        }

    }


     */
    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async readRawData(
        data: any[],
        countyId: string,
        initialScrapper: boolean,
        date: Date,
    ) {
        this.logger.log(`--- readRawData start (countyId=${countyId}, initialScrapper=${initialScrapper}, date=${date})`);

        // 1) Load county once
        let county: County;
        try {
            await this.sleep(1000);
            county = await this.propertiesService.getCountyById(countyId);
            this.logger.log(`📍 Loaded county ${countyId}`);
        } catch (err) {
            this.logger.error(`❌ getCountyById(${countyId}) failed: ${err.stack || err.message}`);
            return;
        }

        // 2) Filter & dedupe valid zpids
        const validItems = data.filter(item => item.zpid && item.zpid !== 'undefined');
        const zpids = Array.from(new Set(validItems.map(item => item.zpid.toString())));
        this.logger.log(`🔍 ${validItems.length} validItems, ${zpids.length} unique zpids`);
        if (!zpids.length) {
            this.logger.log('⚠️ No zpids to process, exiting');
            return;
        }

        // 3) Bulk-load all existing properties
        let existingProperties: Property[];
        try {
            await this.sleep(1000);
            existingProperties = await this.propertiesService.findByZpids(zpids);
            this.logger.log(`✅ Loaded ${existingProperties.length} existing properties`);
        } catch (err) {
            this.logger.error(`❌ findByZpids failed: ${err.stack || err.message}`);
            return;
        }

        // Build a map so we can look up by zpid in O(1)
        const existingPropertiesMap = new Map<string, Property>();
        existingProperties.forEach(p => existingPropertiesMap.set(p.zpid.toString(), p));

        // Prepare to bulk-insert any brand-new properties
        const newPropsToInsert: CreatePropertyDto[] = [];
        let newPropertiesCount = 0;

        // 4) Scan once just to collect new‐property DTOs
        for (const raw of validItems) {
            const z = raw.zpid.toString();
            if (!existingPropertiesMap.has(z)) {
                newPropertiesCount++;
                this.logger.log(`✨ Queued new-Property DTO for zpid=${z}`);
                const dto = new CreatePropertyDto();
                dto.zpid           = z;
                dto.county         = county;
                dto.initialScrape  = initialScrapper;

                dto.streetAddress   = raw.hdpData.homeInfo.streetAddress;
                dto.zipcode         = raw.hdpData.homeInfo.zipcode;
                dto.city            = raw.hdpData.homeInfo.city;
                dto.state           = raw.hdpData.homeInfo.state;
                if (raw.hdpData.homeInfo.bedrooms != null)  dto.bedrooms = Number(raw.hdpData.homeInfo.bedrooms.toFixed(2));
                if (raw.hdpData.homeInfo.bathrooms != null) dto.bathrooms = Number(raw.hdpData.homeInfo.bathrooms.toFixed(2));
                if (raw.hdpData.homeInfo.price != null) dto.price = Math.round(Number(raw.hdpData.homeInfo.price))
                dto.homeType        = raw.hdpData.homeInfo.homeType;
                dto.brokerageName   = raw.brokerName;
                dto.longitude       = raw.hdpData.homeInfo.longitude;
                dto.latitude        = raw.hdpData.homeInfo.latitude;
                dto.livingAreaValue = raw.hdpData.homeInfo.livingArea;
                dto.timeOnZillow    = raw.timeOnZillow;

                newPropsToInsert.push(dto);
                // mark placeholder so we don't queue twice
                existingPropertiesMap.set(z, null as any);
            }
        }

        // 5) Bulk‐insert all new properties in one go
        if (newPropsToInsert.length) {
            this.logger.log(`🗂️ Bulk‐inserting ${newPropsToInsert.length} new properties…`);
            try {
                // <— call into your new service method:
                const inserted = await this.propertiesService.bulkCreateProperties(
                    newPropsToInsert
                );
                // stitch back into existingPropertiesMap:
                inserted.forEach(row => {
                    existingPropertiesMap.set(row.zpid, { id: row.id } as Property);
                });
                this.logger.log(`✅ Bulk‐inserted ${inserted.length} properties`);
            } catch (err) {
                this.logger.error(`❌ Bulk‐insert properties failed: ${err.stack || err.message}`);
                return;
            }
        }
        // 6) Bulk‐load **all** existing listings for all now‐known properties
        let listings: PropertyListing[];
        try {
            await this.sleep(1000);
            listings = await this.propertiesService.propertiesListingFind(
                Array.from(existingPropertiesMap.values()).filter(Boolean)
            );
            this.logger.log(`✅ Loaded ${listings.length} existing listings`);
        } catch (err) {
            this.logger.error(`❌ propertiesListingFind failed: ${err.stack || err.message}`);
            return;
        }

        // 7) Build existing‐listings set
        const existingListings = new Set(
            listings.map(l => `${l.property.id}:${l.status}`)
        );
        this.logger.log(`🔖 existingListings set size=${existingListings.size}`);

        // 8) Now loop rawItems *again*, queue up any new status‐changes
        const toInsert: PropertyListing[] = [];
        let newStatusChangesCount = 0;

        const statusMap: Record<string, PropertyStatus> = {
            Pending:     PropertyStatus.PENDING,
            ComingSoon:  PropertyStatus.COMING_SOON,
            ForSale:     PropertyStatus.FOR_SALE,
        };

        for (const raw of validItems) {
            const rawZpid = raw.zpid.toString();
            this.logger.log(`\n🔄 raw zpid=${rawZpid}`);
            const property = existingPropertiesMap.get(rawZpid)!;
            this.logger.log(`ℹ️ Using Property id=${property.id}`);

            let rawPropertyStatus = statusMap[raw.rawHomeStatusCd];

            // here we should add logic to check if rawPropertyStatus is ForSale, check statusText if it is "Contingent"
            // if it is, give him a status Pending - PropertyStatus.PENDING
            if(rawPropertyStatus === PropertyStatus.FOR_SALE && raw.statusText === "Contingent"){
                rawPropertyStatus = PropertyStatus.PENDING;
            }
            // make sure to add field 'statusText' to raw const


            // here logic ends

            // here is the logic if status have StatusText 'For Rent' to continue, those are useles

            if (!rawPropertyStatus) {
                this.logger.warn(`⚠️ Unknown status '${raw.rawHomeStatusCd}' for zpid=${rawZpid}`);
                continue;
            }
            const key = `${property.id}:${rawPropertyStatus}`;
            if (!existingListings.has(key)) {
                newStatusChangesCount++;
                this.logger.log(`🔖 Queuing new PropertyListing for property.id=${property.id}, status=${rawPropertyStatus}`);
                try {
                    await this.sleep(1000);
                    const pl = await this.propertiesService.propertyListingCreate(property, rawPropertyStatus, date);
                    toInsert.push(pl);
                    existingListings.add(key);
                } catch (err) {
                    this.logger.error(`❌ propertyListingCreate failed for ${key}: ${err.stack || err.message}`);
                }
            } else {
                this.logger.log(`ℹ️ Listing already exists (${key}), skipping`);
            }
        }

        // 9) Bulk‐save listings + grant access
        if (toInsert.length) {
            this.logger.log(`🚚 Bulk‐saving ${toInsert.length} new PropertyListings…`);
            try {
                await this.sleep(1000);
                const saved = await this.propertiesService.propertyListingsBulkSave(toInsert);
                this.logger.log(`✅ Bulk-inserted ${saved.length} listings`);

                await this.sleep(1000);
                await this.propertiesService.grantBulkListingAccessToSubscribedUsers(saved, countyId);
                this.logger.log(`🔓 Granted access for ${saved.length} listings`);
            } catch (err) {
                this.logger.error(`❌ Bulk‐save or grant‐access failed: ${err.stack || err.message}`);
            }
        } else {
            this.logger.log('ℹ️ No new listings to bulk-save');
        }

        // 10) Final summary
        this.logger.log(`✨ readRawData summary: newProperties=${newPropertiesCount}, newStatusChanges=${newStatusChangesCount}`);
    }

    async getZillowUrlsForCounty(urls: string[]) {
        let finalFinalObject = [];
        for (const url of urls) {
            let minPrice = 20000;
            let maxPrice = 90000;
            let lastResult = 0;
            let repeatedResult = 0;

            let finalObject = [];
            let done = false;
            for (let i = 0; !done; i++) {
                // Instead of returning, log and continue to process remaining items
                /*  const randomDelay = Math.floor(Math.random() * (25000 - 5000 + 1)) + 5000;
                  this.logger.log(`Waiting for ${randomDelay} ms before processing next iteration.`);
                  await new Promise((resolve) => setTimeout(resolve, randomDelay));
  */
                const resultNumber = await this.getZillowResults(url, minPrice, maxPrice);
                console.log(`Number of results is: ${resultNumber} on iteration ${i} with minPrice: ${minPrice} and maxPrice: ${maxPrice}`);

                if (resultNumber > 470) {
                    console.log(`${resultNumber} is more than max allowed 420. Deducting 10k from maxPrice: ${maxPrice}`)
                    maxPrice = maxPrice - 7000; // -10k usual
                    if (maxPrice > 1000000) {
                        console.log("maxPrice is more than 1mil. we will deduct extra 75k")
                        maxPrice = maxPrice - 25000
                    }
                    if (maxPrice > 2000000) {
                        console.log("maxPrice is more than 2mil. we will deduct extra 125k")
                        maxPrice = maxPrice - 45000
                    }
                    if (maxPrice > 4000000) {
                        console.log("maxPrice is more than 4mil. we will deduct extra 250k")
                        maxPrice = maxPrice - 58000
                    }
                    if (lastResult === resultNumber) {
                        repeatedResult++;
                    } else {
                        lastResult = resultNumber;
                        repeatedResult = 0;
                    }
                    continue;
                }

                if (resultNumber < 300) {
                    if (maxPrice > 1000000) {
                        console.log("maxPrice is more than 1mil........ adding extra 200k")
                        maxPrice = maxPrice + 50000;
                    }
                    if (maxPrice > 2000000) {
                        console.log("maxPrice is more than 2mil........ adding extra half 500k")
                        maxPrice = maxPrice + 100000;
                    }
                    if (maxPrice > 4000000) {
                        console.log("maxPrice is more than 4mil........ SETTING MAX PRICE TO 50mil")
                        maxPrice = 50000000;
                    }

                    if (resultNumber < 100) {
                        console.log(`${resultNumber} is less than min allowed 300... even under 100results...  Adding 100k to maxPrice: ${maxPrice}`)
                        maxPrice = maxPrice + 100000; // 100k
                    } else if (resultNumber < 200) {
                        console.log(`${resultNumber} is less than min allowed 300... even under 200results...  Adding 75k to maxPrice: ${maxPrice}`)
                        maxPrice = maxPrice + 75000; //75k usual
                    } else if (resultNumber < 300) {
                        console.log(`${resultNumber} is less than min allowed 300...  Adding 50k to maxPrice: ${maxPrice}`)
                        maxPrice = maxPrice + 50000;
                    }


                }
                //check if results number repeat after new request check
                if (lastResult === resultNumber) {
                    console.log(`${resultNumber} does repeat from last request. Noted. Repeated so far: ${repeatedResult} + this time.`)
                    repeatedResult++;
                } else {
                    lastResult = resultNumber;
                    repeatedResult = 0;
                }
                /*
                if (repeatedResult > 5 && repeatedResult < 8) {
                    console.log(`It has repeated already ${repeatedResult} so I have to add extra 50k`)
                    maxPrice = maxPrice + 50000;
                }
                */
                if (repeatedResult > 8) {
                    finalObject.push({
                        minPrice: minPrice,
                        maxPrice: maxPrice,
                        resultNumber: resultNumber
                    })
                    console.log(`Results number is repeating to many time. We are done here!`)
                    done = true;
                }

                if (maxPrice > 49000000) {
                    finalObject.push({
                        minPrice: minPrice,
                        maxPrice: maxPrice,
                        resultNumber: resultNumber
                    })
                    console.log(`Results number is repeating to many time. We are done here!`)
                    done = true;
                }


                if (resultNumber < 470 && resultNumber > 300) {
                    finalObject.push({
                        minPrice: minPrice,
                        maxPrice: maxPrice,
                        resultNumber: resultNumber
                    })
                    minPrice = maxPrice;
                    maxPrice = maxPrice + 15000; // usual 50k
                }
                console.log("__________________________________ result so far ______________________________________________________________")
                console.log(JSON.stringify(finalObject))
                console.log("_________________________________ Going to next iteration ______________________________________________________")

            }

            console.log("Iteration is done and here is the result:")
            console.log(finalObject)
            finalFinalObject.push(finalObject);
        }
        console.log("EVERYTHING IS DONE:")
        console.log(finalFinalObject)
        return finalFinalObject;
    }

    private async getZillowResults(zillowUrl: string, minPrice: number, maxPrice: number) {

        // Define input data from Zillow link and headers
        const inputData = await this.defineInputData(zillowUrl, minPrice, maxPrice);
        const headers = await this.defineHeaders();

        // Using the datacenter proxy for the main run
        const proxyUrl = "http://brd-customer-hl_104fb85c-zone-residential_proxy1:qf2a0h0fhx4d@brd.superproxy.io:33335";
        const proxyAgent = new HttpsProxyAgent(proxyUrl);
        const axiosConfig: any = {
            headers,
            httpsAgent: proxyAgent,
            proxy: false,
        };
        const response = await firstValueFrom(
            this.httpService.put(
                "https://www.zillow.com/async-create-search-page-state",
                inputData,
                axiosConfig
            )
        );

        const results = response.data?.cat1?.searchResults?.mapResults;

        return results.length;
    }

    private async defineInputData(zillowUrl: string, minPrice: number, maxPrice: number): Promise<any> {
        const cleanedUrl = zillowUrl.trim();
        const parsedUrl = new URL(cleanedUrl);

        console.log("zillowUrl:", zillowUrl)
        console.log("minPrice:", minPrice)
        console.log("maxPrice:", maxPrice)
        const searchQueryStateEncoded = parsedUrl.searchParams.get("searchQueryState");
        console.log("searchQueryStateEncoded", searchQueryStateEncoded)
        if (!searchQueryStateEncoded) {
            throw new Error("No searchQueryState parameter found in the URL.");
        }
        const searchQueryStateJson = decodeURIComponent(searchQueryStateEncoded);
        console.log("searchQueryStateJson", searchQueryStateJson)
        const searchQueryState = JSON.parse(searchQueryStateJson);

        const {west, east, south, north} = searchQueryState.mapBounds;
        const zoomValue = searchQueryState.mapZoom;
        const searchValue = searchQueryState.usersSearchTerm;
        const regionSelection = searchQueryState.regionSelection;
        const filterState = searchQueryState.filterState;

        return {
            searchQueryState: {
                pagination: {},
                isMapVisible: true,
                isListVisible: true,
                mapBounds: {west, east, south, north},
                mapZoom: zoomValue,
                usersSearchTerm: searchValue,
                regionSelection,
                filterState: {
                    sortSelection: {value: filterState?.sort?.value ?? ""},
                    isNewConstruction: {value: filterState?.nc?.value ?? true},
                    isAuction: {value: filterState?.auc?.value ?? true},
                    isForSaleForeclosure: {value: filterState?.fore?.value ?? true},
                    isPendingListingsSelected: {value: filterState?.pnd?.value ?? true},
                    isComingSoon: {value: filterState?.cmsn?.value ?? true},
                    doz: {value: filterState?.doz?.value ?? "1"},
                    isTownhome: {value: filterState?.tow?.value ?? true},
                    isMultiFamily: {value: filterState?.mf?.value ?? true},
                    isCondo: {value: filterState?.con?.value ?? true},
                    isLotLand: {value: filterState?.land?.value ?? true},
                    isApartment: {value: filterState?.apa?.value ?? true},
                    isManufactured: {value: filterState?.manu?.value ?? true},
                    isApartmentOrCondo: {value: filterState?.apco?.value ?? true},
                    isPreForeclosure: {value: filterState?.pf?.value ?? false},
                    isForeclosed: {value: filterState?.pmf?.value ?? false},
                    price: {min: minPrice.toString(), max: maxPrice.toString()},
                },
            },
            wants: {cat1: ["mapResults"]},
            requestId: 2,
            isDebugRequest: false,
        };
    }

    /*
        private async defineInputData(zillowUrl: string): Promise<any> {
            // Clean up and parse the URL
            const cleanedUrl = zillowUrl.trim();
            const parsedUrl = new URL(cleanedUrl);

            // Extract the URL parameter that contains the Zillow search state
            const searchQueryStateEncoded =
                parsedUrl.searchParams.get("searchQueryState");
            if (!searchQueryStateEncoded) {
                throw new Error("No searchQueryState parameter found in the URL.");
            }
            const searchQueryStateJson = decodeURIComponent(searchQueryStateEncoded);
            const searchQueryState = JSON.parse(searchQueryStateJson);

            // Extract map bounds, zoom, search term, region selection, and filter state
            const {west, east, south, north} = searchQueryState.mapBounds;
            const zoomValue = searchQueryState.mapZoom;
            const searchValue = searchQueryState.usersSearchTerm;
            const regionSelection = searchQueryState.regionSelection;
            const filterState = searchQueryState.filterState;

            // Map filter values with defaults
            const sortSelection = filterState?.sort?.value ?? "";
            const isNewConstruction = filterState?.nc?.value ?? true;
            const isAuction = filterState?.auc?.value ?? true;
            const isForeclosure = filterState?.fore?.value ?? true;
            const isPending = filterState?.pnd?.value ?? true;
            const isComingSoon = filterState?.cmsn?.value ?? true;
            const daysOnZillow = filterState?.doz?.value ?? "1";
            const isTownhome = filterState?.tow?.value ?? true;
            const isMultiFamily = filterState?.mf?.value ?? true;
            const isCondo = filterState?.con?.value ?? true;
            const isLotOrLand = filterState?.land?.value ?? true;
            const isApartment = filterState?.apa?.value ?? true;
            const isManufactured = filterState?.manu?.value ?? true;
            const isApartmentOrCondo = filterState?.apco?.value ?? true;
            const isPreForeclosure = filterState?.pf?.value ?? false;
            const isForeclosed = filterState?.pmf?.value ?? false;

            // Extract price range (default: min = 0, max = no limit)
            const priceFilter = filterState?.price || {};
            const minPrice = priceFilter.min ?? 0;
            const maxPrice = priceFilter.max ?? null;

            // Build the payload matching Zillow’s expected input
            return {
                searchQueryState: {
                    pagination: {},
                    isMapVisible: true,
                    isListVisible: true,
                    mapBounds: {west, east, south, north},
                    mapZoom: zoomValue,
                    usersSearchTerm: searchValue,
                    regionSelection,
                    filterState: {
                        sortSelection: {value: sortSelection},
                        isNewConstruction: {value: isNewConstruction},
                        isAuction: {value: isAuction},
                        isForSaleForeclosure: {value: isForeclosure},
                        isPendingListingsSelected: {value: isPending},
                        isComingSoon: {value: isComingSoon},
                        doz: {value: daysOnZillow},
                        isTownhome: {value: isTownhome},
                        isMultiFamily: {value: isMultiFamily},
                        isCondo: {value: isCondo},
                        isLotLand: {value: isLotOrLand},
                        isApartment: {value: isApartment},
                        isManufactured: {value: isManufactured},
                        isApartmentOrCondo: {value: isApartmentOrCondo},
                        isPreForeclosure: {value: isPreForeclosure},
                        isForeclosed: {value: isForeclosed},
                        price: {min: minPrice, max: maxPrice},
                    },
                },
                wants: {cat1: ["mapResults"]},
                requestId: 2,
                isDebugRequest: false,
            };
        }
    */
    private async defineHeaders(): Promise<Record<string, string>> {
        // Predefine multiple Zillow cookie sets (20 different ones)
        const cookiePool = [
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%2401ba8c6d-c246-4a48-abd6-a409ebdd8bc2; zgsession=1|5231922f-d82a-4f6d-8a04-d06352f6e4ba; _ga=GA1.2.627200317.1762635913; _gid=GA1.2.2083211925.1762635913; zjs_anonymous_id=%2201ba8c6d-c246-4a48-abd6-a409ebdd8bc2%22; zjs_user_id=null; zg_anonymous_id=%22356cf0ab-5bf6-4623-8009-a2ccb4c881c2%22; pxcts=9df3f2c0-bce6-11f0-a22a-c22e5866e7a1; _pxvid=9df3e802-bce6-11f0-a22a-7bcab9336693; AWSALB=ou7B5noH5C0KXqDSMaw59kePZyNZk7DI9tj0tObtCi9w+05MAvxksBOrsmL3/OK/YGcVW+4rY2J0P/6Ef9mF1/zDsJrHHtBtBeNV9E/E+xKLGh0CUBti2U6zE+xs; AWSALBCORS=ou7B5noH5C0KXqDSMaw59kePZyNZk7DI9tj0tObtCi9w+05MAvxksBOrsmL3/OK/YGcVW+4rY2J0P/6Ef9mF1/zDsJrHHtBtBeNV9E/E+xKLGh0CUBti2U6zE+xs; JSESSIONID=0912E9B73799C38253F9B53FA0174AE5; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762635913233,\"i_b\":\"4Oc70x13D4ya3eA6C4xziUrWdsFr+PXVj16rugXZ47U\"}; _px3=3d4788be6479d0ed67b261c3536116a305eb6c62e385d22bb85ebb8c81d4407e:BTmklfY0hXqVfnqYm44nX4ls4+n91cmvD8DUBL3pKUuwkypyB8ITiOlR4LTYrZbc30Z2XOCWnEepij80O+IYXQ==:1000:1QtIvMTLbRDT0fQnTZQtAlnQOBMtfkwLqf6TZ0K1/fnxVWgheNDcTpNJy6H967qhz64ZInuwfT7QpMU4gx1eSHfTamfKgdLJfZp/14o/IOqn+pLo85wuQqfMT2ozpCil2v7w6aDOw8fPk1l+ZzXc4MAAk67gTRMB/SX3paUL+o4CXPWe0Zdcx8WPA3bL/HvnL6Y/FqnxqqbgSB+l8okMSUIz0oZ0Br+A4uxWEvxOLmLQDTwgcBpsS598cFek9Cor6jAHoKC68A1+slsJf8DQ7w==; _gat=1; _gcl_au=1.1.64974347.1762635915; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.3b031427-fcb8-4347-82a9-8de70731241f; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.b041b2f6-adf1-4920-8b36-a8383bcfc5ce; _rdt_uuid=1762635914717.3971b106-bcbf-4ad3-bc62-a05c433e378f; _scid=RU44Ra8DrfcGCeOnrxQqRHJT9McRio6X; _scid_r=RU44Ra8DrfcGCeOnrxQqRHJT9McRio6X; _uetsid=9f374ea0bce611f0945201aa12450bf4; _uetvid=9f376d00bce611f0bb085d6737e14797; _fbp=fb.1.1762635914893.99995560194975048; tfpsi=094d2f89-cb67-4ea7-a591-03fd0644fa29; DoubleClickSession=true; _tt_enable_cookie=1; _ttp=01K9JMK7P5GV6HZHSHCNQ10E0Z_.tt.1; _pin_unauth=dWlkPU1HUTRZMlkxWlRJdE9XVmpaaTAwTW1RMUxUZ3hNMkl0WXpsaU4yWXdNR1UxTXpRdw; _ScCbts=%5B%5D; _clck=zctxv1%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=3980effa850ce7a3:T=1762635915:RT=1762635915:S=ALNI_MaxXOjTQOyg89KE2S1FBgyyUPCTrA; __gpi=UID=000012882619c8a1:T=1762635915:RT=1762635915:S=ALNI_MauTi039aisSNmYoaINrCBXO03wkw; __eoi=ID=e6b1b7dd8f3b3b65:T=1762635915:RT=1762635915:S=AA-AfjYh4Lz2CzRRNmrMxdYA2IC6; ttcsid_CN5P33RC77UF9CBTPH9G=1762635914952::1yFML74nPY9QQNqnH8lF.1.1762635919916.0; ttcsid=1762635914952::RN1dUpXc82VgyJPR_aRO.1.1762635919917.0; _clsk=akzasb%5E1762635920354%5E3%5E0%5Ea.clarity.ms%2Fcollect; search=6|1765227920751%7Crect%3D42.362854749130676%2C-87.31789475878907%2C41.30076377536622%2C-88.14598924121094%26rid%3D17426%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0917426%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%24c358d3b5-1fcb-4fb8-be2c-aaeb6dc3ab52; zgsession=1|f18e62c3-c478-4e3a-9c3b-121b113b7942; _ga=GA1.2.1868531173.1762635964; _gid=GA1.2.638756872.1762635964; zjs_anonymous_id=%22c358d3b5-1fcb-4fb8-be2c-aaeb6dc3ab52%22; zjs_user_id=null; zg_anonymous_id=%222df0d32b-68ef-4094-9081-e41f223d7e69%22; pxcts=bca8045f-bce6-11f0-a028-b7cd3ee3c474; _pxvid=bca7fd64-bce6-11f0-a028-69664fa37694; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762635964920,\"i_b\":\"f8jUPrg6ymVhl7unIxE6xH42yrrRJl+zSOqDlsWVrs8\"}; AWSALB=y5o+aqeR4o1KR9vD3FEgME1S18nDQgAanYlaZOvt+KfeoNi0GdxqWkaivMQxxeXMco9znurB356s0Us7n2nF2gwKBj8zna0Nnw1vyhHdlF00EOErEOrou9whCS1h; AWSALBCORS=y5o+aqeR4o1KR9vD3FEgME1S18nDQgAanYlaZOvt+KfeoNi0GdxqWkaivMQxxeXMco9znurB356s0Us7n2nF2gwKBj8zna0Nnw1vyhHdlF00EOErEOrou9whCS1h; JSESSIONID=B4D291EFDB45B3E4E9F3624688E958B4; _px3=5befcd509f2d53b3ff803c97dc2a4ba00c32907ac7e4ec8a5b02ed3a2e43f652:8d+Y9+TUO2H9P4APzFD21NJf6W63FODgqJ+s6qfaQ69HGHTg/Ks7d5890bMvQ6HclpR9nEas0wz9bVW6gVYzTQ==:1000:/pdWbJZfvOszLaJla84JVJ1ino83CCz9Slx24XqfAO0whkFPm9en1xsoXr5MapwQRTZs2rCcDc13baVrLJrLnXTxktYIAS4VYEgiuNiNZ5xPss9vFq8s0mmLv+OtIFvpsZ59iDsN37Gg8EAP3P+vC2rwgtBkGRr3+Tg6UyJB2817lciclydVoWifWc6938QyPbquCP9rg3pcGXbN7Icd0EiaVgEoIT6FFa7PqUTvnMlk3fjwzbCU35Tjc935mP3wpAJA6Bh70IaIBRnm8cQKGA==; _gat=1; _gcl_au=1.1.60764090.1762635966; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.6be4dda0-4bf9-4110-8444-11db2361b2a5; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.b3ffb483-663b-4f12-a85b-2d518d5a4eda; _rdt_uuid=1762635966367.be77dc0e-e049-4a68-b7d8-2211c7d3626c; _scid=qNoMFQz8_qqfnhq1ZISe94jvyJd-dKkr; _scid_r=qNoMFQz8_qqfnhq1ZISe94jvyJd-dKkr; tfpsi=4119a561-1490-44bc-ad28-e60412daf9b2; _pin_unauth=dWlkPU1HSTBPV1UyTkdRdE5XUXlOaTAwWkRRMExXRTVOR1l0TkRVek5HVXhaREJsWVdZeg; _fbp=fb.1.1762635966634.64509004895078685; _ScCbts=%5B%5D; _uetsid=be26cac0bce611f08aba5b4a3a03e145; _uetvid=be26c4a0bce611f08f88d1dd60e1b05b; _tt_enable_cookie=1; _ttp=01K9JMMT86V7CT7JAG8FB0XEYX_.tt.1; DoubleClickSession=true; _clck=jqi9sc%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=129ea0bbbeb6fef7:T=1762635967:RT=1762635967:S=ALNI_MYQHWnmjO9z_kqIkB5_H07jLzSd-w; __gpi=UID=00001288267bec58:T=1762635967:RT=1762635967:S=ALNI_MZzkEzxbLXLEog0LBlGlsahAQlz7w; __eoi=ID=4db96713f4918fe9:T=1762635967:RT=1762635967:S=AA-AfjZvbR9Zl4tVjtXGWdZ4O5hD; ttcsid_CN5P33RC77UF9CBTPH9G=1762635966729::oiWtHtUg7kmf9c-dUrbW.1.1762635972521.0; ttcsid=1762635966729::4w8aUj7uzH_fHmPd57sB.1.1762635972521.0; search=6|1765227972788%7Crect%3D42.09839376966203%2C-87.83875660439054%2C41.96604401716402%2C-87.93608860512296%26rid%3D17761%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0917761%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; _clsk=k53r7f%5E1762635972988%5E3%5E0%5Ea.clarity.ms%2Fcollect",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%24f06437d9-08c4-426b-84f2-2fd89aa692a9; zgsession=1|867ba52a-1694-4b8e-a941-a8654c2b8a1d; _ga=GA1.2.1502975365.1762636054; _gid=GA1.2.1074538286.1762636054; zjs_anonymous_id=%22f06437d9-08c4-426b-84f2-2fd89aa692a9%22; zjs_user_id=null; zg_anonymous_id=%22cdc3f624-f622-4ee7-a6fd-44c135279007%22; pxcts=f2407eaf-bce6-11f0-a6ce-d47711c646fa; _pxvid=f2407715-bce6-11f0-a6ce-ff9aab915467; AWSALB=/RRtDO13HwfM5JBbJYYNHiHI1I085ucBXV8FilGtV0iWGyPVB6HV5pA/ykake/A1jzjiVQuaO8/3MZGNUcyQcXatSZ5/CrM/zpyzRJIrG4e4oT9QmTpb3Y/J83sP; AWSALBCORS=/RRtDO13HwfM5JBbJYYNHiHI1I085ucBXV8FilGtV0iWGyPVB6HV5pA/ykake/A1jzjiVQuaO8/3MZGNUcyQcXatSZ5/CrM/zpyzRJIrG4e4oT9QmTpb3Y/J83sP; JSESSIONID=1D2E45C23D2F10517E5BB220A28432A7; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762636055094,\"i_b\":\"HDLw52XOKsDXN9idEvLA9ALqT6+8LFcjBxG720kL9LM\"}; _px3=cb3cf0a6d57bdd08ad986e6c94744a441fa82d37a7d4451cbb891af44e4702b1:3VqVAuOeGUhTA5PDJbhFBz29DPufNK+GPvIQkQoSAddX0Ju72/ia5at1jPkV5y8tOap8T6W1JV2Dfafnm1YhFA==:1000:WGKWzYYpKHGWxOO/IDSoE3J6YFYU8VJB+zZgZHm0/jYHp0cyFl8OmwKY4pQUX69KmnQ4mH5Z5ZYJRijnXAaM5hKQBzb3hNiqg7c8kYGeJWKwU3ut8g9Tf85NCO920E+VTVfF58wOuuW6LcJuC1CeugBg/cJVVkCEmr3o9Jvz0dD9vnNBvglM6bcPM3ffJfIdbO2Kud6rYGo0Mk1uX4eFl57bM60vIopJ20mS7Z2dEamJKcasR/7hgX2X54FO2cPlBglCYRdvEIt1bCnctPF7MA==; _gat=1; _gcl_au=1.1.1574770555.1762636056; tfpsi=beb0e723-bbd8-48e8-ac6c-eb7697e82dd7; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.741a70f5-dc72-4b22-b98b-36e05c06d420; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.e13dabda-49dd-4a90-838d-6513937a9341; _rdt_uuid=1762636056473.77cd2b1c-e215-4ef3-8a6a-2a1b39419a58; _scid=iThFO1kuM6I4PbZ2yvc0WqBNAb3Lp026; _scid_r=iThFO1kuM6I4PbZ2yvc0WqBNAb3Lp026; _fbp=fb.1.1762636056535.32188051752125647; _uetsid=f3bb9790bce611f0ac8aaf2373755f41; _uetvid=f3bba490bce611f0acc01baf4cd422cc; _tt_enable_cookie=1; _ttp=01K9JMQJ1GECY7552ZYWCENCRZ_.tt.1; DoubleClickSession=true; _ScCbts=%5B%5D; _pin_unauth=dWlkPU5qSXhZakJqTkdJdFpUa3pZeTAwWm1ReExXSmlZMkl0WVROalpqbGlabVkwT0RWaw; _clck=gy098p%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=e1a640d8786f4e15:T=1762636057:RT=1762636057:S=ALNI_MYULQsqgjTIWCHGV4eris1G9ik6bg; __gpi=UID=00001288266611b1:T=1762636057:RT=1762636057:S=ALNI_MaNTwl6sFNT8PDfiO4JxDEdOp6LVA; __eoi=ID=9bfb80e3c8b0d2b0:T=1762636057:RT=1762636057:S=AA-AfjYqpv0mk1nQBQ8BrSmAYz1f; _clsk=gt6bnv%5E1762636067790%5E2%5E0%5Ea.clarity.ms%2Fcollect; search=6|1765228067837%7Crect%3D42.08970562880883%2C-88.02742697507885%2C41.957337768253716%2C-88.17059256345776%26rid%3D33889%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0933889%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; ttcsid_CN5P33RC77UF9CBTPH9G=1762636056626::5n9AxUMEIGUeFkcPlJpn.1.1762636070400.0; ttcsid=1762636056626::QVgzsnNggit3dgYLElCj.1.1762636070400.0",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%24f5934801-396f-42da-beaa-d4ec19cac13a; zgsession=1|6b693db4-5744-4960-9612-2f449cb6a7f3; _ga=GA1.2.1577452852.1762636133; _gid=GA1.2.1012642638.1762636133; zjs_anonymous_id=%22f5934801-396f-42da-beaa-d4ec19cac13a%22; zjs_user_id=null; zg_anonymous_id=%22471695ec-f8a0-4d0b-bb47-e1a93a7c1d33%22; pxcts=219d27fc-bce7-11f0-b3de-465031757a5f; _pxvid=219d1fd5-bce7-11f0-b3de-9a1deb5b5c0c; zjs_user_id_type=%22encoded_zuid%22; AWSALB=HFCdWulE+bbLOz7jEVngEl+wC4VIyGPAlnPerK1BPKpPxo80T5mtyY7Af0XkHvGBmbml6DQmZtrxFxzt0aMfhKmOVTl285HvsKpHzRH0YVbeVgoC4pMZ+xoSQlxt; AWSALBCORS=HFCdWulE+bbLOz7jEVngEl+wC4VIyGPAlnPerK1BPKpPxo80T5mtyY7Af0XkHvGBmbml6DQmZtrxFxzt0aMfhKmOVTl285HvsKpHzRH0YVbeVgoC4pMZ+xoSQlxt; JSESSIONID=1225857B1AB5B8A307E6E3E618C78931; g_state={\"i_l\":0,\"i_ll\":1762636134113,\"i_b\":\"fKobQstjRc8yok85ruhg3TnUAawXTY694VLM77UbHdk\"}; _px3=1303a74cd0d595ac2a5f763a2666f8f97c6483666b53a34d52da0b93a8f7ca1f:eQaH6HqrJ0AT56V1cz258bGoGgbMxGYb8fpp3mmkRACbUCK0PMstzo7KyT7UoMGPFir3LoDtBFT6HYouE+HC2g==:1000:rOY8+vcM6pB+anzQoQROeArw6ZriaE2JlmBhutW9qHOuLdqeZmg9AYpMFClasJkN+koFycKG4peFsGXzZEbV+enxJTQcFmVpCa5usrMbg8we1i3rYPSIBXY+Dz+PuCPTcef7yBNXC+gFJsYrijnHU+AYBD+qGln/WJnTR7x4Nc+if1ZIhgLJ/+EQ1M6tkm62EuCyWht5W0bn9F2XL+go5obhReawg0i33vogqapcYtOSHuQHYnAZYZppcmm33DBpcynF04soPmh4Ds2pcYU+Cw==; _gat=1; _gcl_au=1.1.1640524502.1762636135; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.d36cd723-8414-4fb1-b7df-2e98c5abd3e9; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.508d6f40-0e76-4ab9-9b10-19c1ef7bc312; _rdt_uuid=1762636134966.44e50ff2-613f-4f53-80e7-73c763009ae7; _scid=CHqwVotnScqxtGgqjflF7emPfNj94Yb9; _scid_r=CHqwVotnScqxtGgqjflF7emPfNj94Yb9; tfpsi=8f0dae40-76c0-44ba-a40c-e00a4560636d; DoubleClickSession=true; _ScCbts=%5B%5D; _uetsid=22ab5890bce711f0872f271079489072; _uetvid=22ab3de0bce711f095fc156f72c2571b; _fbp=fb.1.1762636135397.208575340980541268; _tt_enable_cookie=1; _ttp=01K9JMSZ0KEY0393YBBAGKTX4E_.tt.1; _pin_unauth=dWlkPU1HSTRZbUl5TXpndE1USXlaUzAwTlRBMUxUazVNMk10T0RSbE1qZzRPRFk0TURjNA; _clck=51rutj%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=40f328b5236d94c9:T=1762636136:RT=1762636136:S=ALNI_MansJjswny4_--HdHiD2ZP8_3NKvQ; __gpi=UID=0000128826330ab3:T=1762636136:RT=1762636136:S=ALNI_MZ7RB2WmQ22tX_bjcpPDk3OY8RLxg; __eoi=ID=348b6135c1fe66cf:T=1762636136:RT=1762636136:S=AA-AfjZmtNrQ2XWwOi99JMgS--V7; search=6|1765228138383%7Crect%3D41.99072395643658%2C-87.8358671022234%2C41.92447141800751%2C-87.93131082780934%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%09%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; ttcsid=1762636135445::CuYlp8gdB8OItUMscyRs.1.1762636139286.0; ttcsid_CN5P33RC77UF9CBTPH9G=1762636135445::1Ej-5zBWgdDaXKZcwdub.1.1762636139286.0; _clsk=f6arj9%5E1762636139549%5E5%5E0%5Ea.clarity.ms%2Fcollect",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%247924bbfa-aa9e-49b1-8167-122557d28857; zgsession=1|a39e1586-03d4-4ffd-a0a1-aaf7fc641c7b; _ga=GA1.2.1384937810.1762636195; _gid=GA1.2.1575484626.1762636195; zjs_anonymous_id=%227924bbfa-aa9e-49b1-8167-122557d28857%22; zjs_user_id=null; zg_anonymous_id=%2240604939-49d3-496d-83a8-45e112cc75e1%22; pxcts=4620f53d-bce7-11f0-b495-1a2e3edbbb37; _pxvid=4620ecd1-bce7-11f0-b495-7fe2a38e81f5; AWSALB=5gTIV4mrDar15/tHl8md9ytnTGjYXNiLf1zVKStDMDlLZMPgqsZjgZPQDmGJJh4J6sw/rQvWA5WRzbiVz8gur6AvychdH6kC7lbl/TwSiO2EHAEw71ZUBDfp2KUy; AWSALBCORS=5gTIV4mrDar15/tHl8md9ytnTGjYXNiLf1zVKStDMDlLZMPgqsZjgZPQDmGJJh4J6sw/rQvWA5WRzbiVz8gur6AvychdH6kC7lbl/TwSiO2EHAEw71ZUBDfp2KUy; JSESSIONID=3416B8547761D3172F7EF9CF2E933322; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762636195402,\"i_b\":\"Cu+kd8+jBtCLW5qnsbPDVPJeCzh8xjhXbvrK4e1JX+o\"}; _px3=a8af10b9c00e58be15ebb754d953833a2846b422fdb7e5f504d5dec4e5a0102a:rMUdWwEfTwCJGXpVSHWtpR8g367riYNV2wlqq1yMrMqnptv2rXeuoTma+oVGp/EtcaaMojHl4FGXRCmsJbTTIg==:1000:Wkbz5+j2uo3cYeBcX/GxWCo9rkDJpbQpSBYAr4ZtBNvxoDD0GjBB3VA1tPp77XacWmSOCFpEbNjfCCOUXmQ0qYeTKNUImwOqB+Ou6lHW0SMOoEnbmWaoy6/Zh0sOfBibDM8iKt5a6QsI+0dYIcxUa5SnwGvbz5o+kFbZ3Xl/GarKoTWXQdLnEm9pMT9wF5Uq+zb9rrndXzFH9vQi75RlUIV4x6ow9AAL/F8Gre58G0kUyBJ40QIySKbXBijqQNDWnQ2VtoHwZ8xE8rj0GHpZAA==; _gat=1; _gcl_au=1.1.1563699754.1762636196; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.3398e99b-b691-4a2e-8cc0-2ba685b2bc0c; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.f3a8da2c-b932-487f-b6d8-ba7ff64a513d; _scid=XkSLjRR3dQOZkwy3p3bOnE1ZRw-G8qIY; _scid_r=XkSLjRR3dQOZkwy3p3bOnE1ZRw-G8qIY; _rdt_uuid=1762636196531.4e10185f-dcc3-4a56-8365-ef2be5c78b22; _uetsid=472fff30bce711f085c989dd5d976f24; _uetvid=47301c80bce711f0a921c77574b85b99; tfpsi=37604c60-2438-4b39-a411-0c86293e9868; _fbp=fb.1.1762636196678.472323674960754665; _ScCbts=%5B%5D; _tt_enable_cookie=1; _ttp=01K9JMVTVHASDN0P1ABMB5NBXM_.tt.1; DoubleClickSession=true; _pin_unauth=dWlkPU1tVTJaR0l6T1dZdE9XRmlPUzAwTkROakxUZ3daV1V0TURJNFptVmpOakkwWXpFMA; _clck=1emmbbw%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=8a8c007678723311:T=1762636197:RT=1762636197:S=ALNI_MZXaLbarsRmrwZ-vmn328wVFcQz8Q; __gpi=UID=00001288261df783:T=1762636197:RT=1762636197:S=ALNI_MboDIwHiV0MeWyjzr159CGD6KypbQ; __eoi=ID=8da2fbb17691db95:T=1762636197:RT=1762636197:S=AA-AfjY4KCSFQ6Ovwg2F3mD0o9LO; search=6|1765228203755%7Crect%3D41.714554436419014%2C-87.73307785620116%2C41.447985652735454%2C-87.99503311743163%26rid%3D33256%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0933256%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; _clsk=s586w3%5E1762636206720%5E6%5E0%5Ea.clarity.ms%2Fcollect; ttcsid_CN5P33RC77UF9CBTPH9G=1762636196723::kat0qrj7-6JENgpG0p3j.1.1762636206834.0; ttcsid=1762636196723::9YFMXf0sum1omvG19KI4.1.1762636206834.0",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%24abab4c28-b265-4aac-9633-e365d030f7d9; zgsession=1|c5256252-bcb3-4578-878a-a708ba0e7b90; _ga=GA1.2.132555964.1762636321; _gid=GA1.2.2094939104.1762636321; zjs_anonymous_id=%22abab4c28-b265-4aac-9633-e365d030f7d9%22; zjs_user_id=null; zg_anonymous_id=%222bef496c-362c-4e11-afca-abf4e654c47c%22; pxcts=914c3d28-bce7-11f0-bb3c-1e19ea77539b; _pxvid=914c34f2-bce7-11f0-bb3c-175864dda938; zjs_user_id_type=%22encoded_zuid%22; AWSALB=2NehLAVuyheKWew5ML+whrjqd6tN17tWHQrlVsF6afw5+ujcE1oJyig9saRpmVvkJa8fX2cXN4oi5O4xrcdF2gTHm6wsxqknUTwnwpu/Z9yiH/C6m3JzON1iS674; AWSALBCORS=2NehLAVuyheKWew5ML+whrjqd6tN17tWHQrlVsF6afw5+ujcE1oJyig9saRpmVvkJa8fX2cXN4oi5O4xrcdF2gTHm6wsxqknUTwnwpu/Z9yiH/C6m3JzON1iS674; JSESSIONID=0942491DAEC51292A8DBCD45FB9197FF; g_state={\"i_l\":0,\"i_ll\":1762636321704,\"i_b\":\"HRu3Y6w83IaDhkajjuwKhWlVtAEJsbFrh1+3NGjIXfU\"}; _px3=31df86f925ceaad4fc3bf2b9c47a01209d1f35d4eecd5efd90c972131323ea78:6TwmVsGe6icBPfrcmM7ZjhMHDqUnqUOty0zKCcxHe3SmBCz0c7pWAOyfhZMCz2dolwP/O9YFLEd0J2xhl054+g==:1000:AaZnFiF7KTjGkevu06GxcmDaqeqoMcMuyNgo2PDpqa03IRBPEbFVRrKi5bPUR9PvENdPgG/ENRIFcLGXI8JXlp4HV1qzIMEC3tguoXp89Ntt/qOtg9WfXSqUG+PM7fPdNQwBg6yxtpqU5kJ/tWKbiMNyN1I/4wr3aS6CX3LYJtGlTQIejOB1uK3FBiRp8BgOCz2gxzxX466y/TSpDApdUcO/ByAZKNcciojY/wuBZAX970XgK92SWp23pDSwrv1mSg4nNvIV6GqlrDWw29xHGg==; _gat=1; _gcl_au=1.1.94297267.1762636324; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.e6315ef6-eac7-467f-aef6-1dfdb4595070; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.ff9f4d56-bb7f-4e2b-b1b4-efacc1559af7; _rdt_uuid=1762636323717.1be737e2-c7e5-4c80-9486-58caa010f895; _scid=jzv1CXwO3kH8_aVZvDGgkI1AsYvui_x4; _scid_r=jzv1CXwO3kH8_aVZvDGgkI1AsYvui_x4; _uetsid=93038230bce711f0a6045f142dfd04dc; _uetvid=9303a1f0bce711f0b9a9e3af577d90e1; _fbp=fb.1.1762636323877.749177218826164550; tfpsi=6aa123a6-3727-4b2c-828c-150938e620b5; DoubleClickSession=true; _ScCbts=%5B%5D; _pin_unauth=dWlkPU5USmhaV1kyTTJJdE1qRm1OaTAwTURJMUxUaGtPVFV0TURGa05qazFNall5WXpjMw; _tt_enable_cookie=1; _ttp=01K9JMZQ72C7D78J3HP96RN63P_.tt.1; _clck=hw8x7g%5E2%5Eg0u%5E0%5E2138; __gads=ID=fe6e62dffacd92cb:T=1762636324:RT=1762636324:S=ALNI_MYxgYepUlXATWQHAaRzxF9Ca-3FZQ; __gpi=UID=000012882645126d:T=1762636324:RT=1762636324:S=ALNI_Ma2eRuSEeLHPCpdoVAVJAh2y-QbLw; __eoi=ID=291d9d4747369c7a:T=1762636324:RT=1762636324:S=AA-Afjb8JLHj6WK9vP9h5IzCpLwK; _sctr=1%7C1762581600000; search=6|1765228331189%7Crect%3D41.99232132876132%2C-87.83044304785156%2C41.46038698801226%2C-88.44155754980468%26rid%3D39931%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0939931%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; _clsk=1gd44oy%5E1762636331265%5E6%5E0%5Ea.clarity.ms%2Fcollect; ttcsid_CN5P33RC77UF9CBTPH9G=1762636324069::kuIhULZpc2qcwLLXq3Cu.1.1762636333029.0; ttcsid=1762636324070::_P2u6LfP9yWQQpoQvLkQ.1.1762636333029.0",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%24b5e751e0-7112-49ed-9371-0c866362beae; zgsession=1|ef5f9334-355a-4dd6-b3ee-63ef91a7a8f6; _ga=GA1.2.1384823499.1762636381; _gid=GA1.2.346043344.1762636381; zjs_anonymous_id=%22b5e751e0-7112-49ed-9371-0c866362beae%22; zjs_user_id=null; zg_anonymous_id=%22d88cf9a0-4de7-4218-bc0f-013fcbdee763%22; pxcts=b541e7c5-bce7-11f0-9a3f-cdf2a8695e3c; _pxvid=b541dfa9-bce7-11f0-9a3f-91491b634497; zjs_user_id_type=%22encoded_zuid%22; AWSALB=dh3uhfk1eyrjY6Kf+yhrcBSXm4gyOSjiJurJ1KTIezrQy4yDzjEiXWv/lTekYPnJy8fIR3q/uHx5ORgNMI5r6HE6mfPbaiQiy+9oDdxxIplA/0RFPVV4JJNuFOEH; AWSALBCORS=dh3uhfk1eyrjY6Kf+yhrcBSXm4gyOSjiJurJ1KTIezrQy4yDzjEiXWv/lTekYPnJy8fIR3q/uHx5ORgNMI5r6HE6mfPbaiQiy+9oDdxxIplA/0RFPVV4JJNuFOEH; JSESSIONID=673BEEFFC2662BEC8F2F09E6302D7394; g_state={\"i_l\":0,\"i_ll\":1762636381854,\"i_b\":\"mnfnbQWntmae37TbYgBmGe9SFeNBCWhQj0zD8vz/PYo\"}; _px3=56b648ffa2b507636a17f7edb868d22ac0cd1014e13b5545279b0103d8e7a471:HpgGu3K52bJz7jHxTkz18nSBviYvDnlnnDyvrtIH+zLrykvNMQfrCQ2FtaHQWPDX38K4df6nJyAMlNRFPyQGvA==:1000:orXRGMco96of3KZC5LRNxuMD1nLg23BRVnbSxwVNtVKQFgsxQMBPmzGF1Jaum3qtJKzWW2R1HBnBxjnV6toAPxSiiGP5oJrvbhllYz8g1hNJ6Q8AGbcsrVHTxMB9wWTG/TEVxxBPCvixmBCsRWt0jYXxlrOjB/9cDLJ1wTmILQI2We9CMt7SxavN9jSBfRzx7h7z1JMCJOWrQJG5A79HPYUz7BfMvEWHstHotVD3L3SfbNzLKlOkJinZDQVNuBAOlnYV4f429eKzuV84ghloOw==; _gat=1; _gcl_au=1.1.436132952.1762636383; _rdt_uuid=1762636382652.2e3368dd-2ddd-42ef-9c68-38d4a28d3ad1; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.239213a4-0afd-4658-9f9e-194d85768343; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.538d77c5-995d-4cfc-89cf-13e977c6b064; _scid=RihwQq0eqnonJiPiNYzjmW89PMQfrL8r; _scid_r=RihwQq0eqnonJiPiNYzjmW89PMQfrL8r; _uetsid=b62d7700bce711f0950e2de5e9411b7b; _uetvid=b62d9b40bce711f0bc5f899602d890cf; _fbp=fb.1.1762636382875.687647119819879260; _ScCbts=%5B%5D; tfpsi=780c2038-3f9b-4999-8653-dff7ef75b7e6; _tt_enable_cookie=1; _ttp=01K9JN1GSBY5V84X7KK5JF2CKS_.tt.1; DoubleClickSession=true; _pin_unauth=dWlkPVpHTTNaakEwTkRRdE1qRXdaQzAwT1RNekxUazFNREl0WlRFMVpqbGpPVFEwWm1JeA; _clck=11kytzs%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=0e18d1f741b28167:T=1762636385:RT=1762636385:S=ALNI_MaoMTvKMZhfU1GVR6DnMRZAGUbjVA; __gpi=UID=00001288263e9283:T=1762636385:RT=1762636385:S=ALNI_Man5vAyXtvXQhAkj0TVzoqxq8Kysg; __eoi=ID=81e2c75bd7acd585:T=1762636385:RT=1762636385:S=AA-AfjY5oo2NhWOPLkt4pnG_zpYy; ttcsid=1762636383022::rrg-bKHVvrxm5DoBusEr.1.1762636429242.0; ttcsid_CN5P33RC77UF9CBTPH9G=1762636383022::aVYLqnGTJqRgkc2k1YaL.1.1762636429242.0; search=6|1765228429291%7Crect%3D41.89670489769081%2C-87.97766598796251%2C41.63089093568925%2C-88.26331051921251%26rid%3D32522%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0932522%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; _clsk=48aojo%5E1762636429510%5E5%5E0%5Ea.clarity.ms%2Fcollect",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22expire%22%3A1762637375540%7D%7D; zguid=24|%245fafa584-80ee-4fca-86ad-c5bbdfd72f86; zgsession=1|0cc41aac-5aad-462a-8bbd-fc46dbab1734; _ga=GA1.2.1367333074.1762636476; _gid=GA1.2.1615497019.1762636476; zjs_anonymous_id=%225fafa584-80ee-4fca-86ad-c5bbdfd72f86%22; zjs_user_id=null; zg_anonymous_id=%22612a8334-704a-49eb-8195-8f0b3697930f%22; pxcts=edfe54ac-bce7-11f0-b926-287e8a16ba26; _pxvid=edfe4d87-bce7-11f0-b925-f8410b07a2c4; AWSALB=Z4hZ0xds+v0mPngyCrl9/FoG6cnzld6IfZyzH6fG+4w5cnm5VBX2rAaNBDc0alj2KPaEgAfTn+8YhkrORDDrqJ4lc3B3KwBC4XZ+9VBayOErPy0MEmA+QJNwgeC4; AWSALBCORS=Z4hZ0xds+v0mPngyCrl9/FoG6cnzld6IfZyzH6fG+4w5cnm5VBX2rAaNBDc0alj2KPaEgAfTn+8YhkrORDDrqJ4lc3B3KwBC4XZ+9VBayOErPy0MEmA+QJNwgeC4; JSESSIONID=A8CF619F94142847B6F4E3F14D635284; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762636477177,\"i_b\":\"u4iaZ8V/Ooeafa9StU54mOf2tcVVC93hV52N6EKJH8I\"}; _px3=c85dafbbb511ae0b0e324f0333321dcf4cdfb10e0d374d7cac9d027b9a205efe:ot9X6WCcnOZ51Z71fARTHo1WzBwr6HgGiztaF1KGs7dDxNbC5f9iJPUG8uEyowTmIcs8TfsELw9Dj2+djUxZTQ==:1000:4aoVFf8SwhmuyUZMRWEoLqaN/M2U0FS1iVDIO/zt7DVEYJ+Ko6Q3stPw1CDDrbUCKg2P4SwDO8ef2z5GyFvbLOISyX338kfendf+Hrp8Dfsf8ua92cltThG+v83TgY8ChICFIgjUxxmIpDYg77tm0d0U7Pzv4It1eNk1RkRmxLDRqfCiTRiUa8ifeOCEaDDmcEtWeSX6uirfIaYjH3pZBfJfnH0QhIHQXoxaOGjDYvhUbgVXL+i8YXeNrHcSPuxFs85vFxSwSoys81pq4DP3pw==; _gat=1; _gcl_au=1.1.1851941250.1762636478; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.8a81a741-c292-4d32-98af-f8ba88d32832; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.54bbee8c-012c-49bb-9b9e-fae66d00ff05; _rdt_uuid=1762636478188.796445ee-6e04-4ace-bbec-e82ac0673a89; _scid=VKOR5myLD3LOxMxQA5MWEZK4XWjeG4kn; _scid_r=VKOR5myLD3LOxMxQA5MWEZK4XWjeG4kn; _uetsid=ef1e7d10bce711f0996ab39a161c97ce; _uetvid=ef1e8cd0bce711f08146f7ce105c82d5; _fbp=fb.1.1762636478377.750086254454386343; tfpsi=12755115-71bf-427d-8ec5-5f9197ff7215; _tt_enable_cookie=1; _ttp=01K9JN4DY7W2PXW5QF0T1EKRNZ_.tt.1; DoubleClickSession=true; _pin_unauth=dWlkPVpERmpaakkyWTJJdE1qbGhOUzAwTWpOaUxUazFNekl0TjJNM05ESTRaVFptTnpJMw; _ScCbts=%5B%5D; _clck=9t3vzt%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=2c89a215c2b7983b:T=1762636479:RT=1762636479:S=ALNI_MbmIMEEKdkkJyF6sYdkaEoFrSN7lg; __gpi=UID=0000128826b309d5:T=1762636479:RT=1762636479:S=ALNI_MYdSAB6FWlVeA9qZp-EK3TKX7u_QA; __eoi=ID=23adb4a1d4a657a1:T=1762636479:RT=1762636479:S=AA-AfjauCJhcsEDyoF1LzbrqYZTI; ttcsid_CN5P33RC77UF9CBTPH9G=1762636478409::mkOGZ4G70IPDY39LoL0x.1.1762636481493.0; ttcsid=1762636478409::2150qTII2VkRMbHdpFEJ.1.1762636481493.0; search=6|1765228481732%7Crect%3D41.90345918001159%2C-87.8246396560138%2C41.63767325941722%2C-88.22461066431458%26rid%3D24420%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0924420%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; _clsk=10fmaj2%5E1762636481959%5E2%5E0%5Ea.clarity.ms%2Fcollect; _dd_s=rum=2&id=ea7d9848-1fee-48b5-9309-677500c07929&created=1762636476333&expire=1762637381072",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%245cffb333-4100-4c9a-bbba-86cf1968d12a; zgsession=1|43145c7a-4ab0-4cc9-a162-9436be9eb26c; _ga=GA1.2.1874910853.1762638573; _gid=GA1.2.1767297625.1762638573; zjs_anonymous_id=%225cffb333-4100-4c9a-bbba-86cf1968d12a%22; zjs_user_id=null; zg_anonymous_id=%22004eb815-0f25-40f2-982c-6df496d492c8%22; pxcts=cf81cf63-bcec-11f0-8098-4179894df866; _pxvid=cf81c655-bcec-11f0-8098-2e457d005b42; AWSALB=xzjJEr8RtvLG775MdAnq4zJDxRABrLJTkpTt+Uj+ih2wp7ZxS0KUDTax8W16Et+09st1RHaJ+ZrA8JptJnzwmw3O5z8WXHaTOqM5fxTkvkzcW/pmgVFu2XDeSDD9; AWSALBCORS=xzjJEr8RtvLG775MdAnq4zJDxRABrLJTkpTt+Uj+ih2wp7ZxS0KUDTax8W16Et+09st1RHaJ+ZrA8JptJnzwmw3O5z8WXHaTOqM5fxTkvkzcW/pmgVFu2XDeSDD9; JSESSIONID=41968DAE27F86FFBFA3F179313211F92; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762638573296,\"i_b\":\"CLG8fNz3KhwbCv4Fu3eHX831PIwIHa1OBwQMdJr9FDo\"}; _px3=acc005b93d0ec4831a77543099dcdeb818f7bef8006d9acd9a84f76c1763eb23:uO47qYJ6CbyeauS4pbO+HVXMK0vIYhN5wpsFwh/NeG4/Qnk5+Dcvb0CDwK0jCO3pViT7nP9Q/HHSoTeBZ8UoOw==:1000:wgvDCqI26lD3+zleWQjkfFJdzLYK8c+29jfMpG3ibFfV4cRvRc5S8I1Fz84n3+/FTldXzyR75KAUvSpJYgsCZTZduAO5OvIkvOhnTAH2AnysFjwQqnGA/4OagqEMZ/CDXIZ957oQuESnbotr2rSqlRqEWoAsFJekHCLgt9++X2QiL6Hp1bZUur1++GongljhyBqdHejjaKpb7wRKzrAaV9QUOZq4SBkk/dL3uGilzRCSums60d0YSnim5VGzxnQ4HP2LIrOQmYEz2wpsEgbNDg==; _gat=1; _gcl_au=1.1.642666812.1762638574; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.9ee87528-cb5e-495e-b670-b6aa1b78ed89; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.28f48f13-deaf-4548-ac91-bbf3fd17bc2d; _rdt_uuid=1762638574040.74dc9c7c-2e06-4003-bb55-c395986d2159; _scid=6iaoVJ8u3wDU365Ru7YQzAk7ZNYB3lSs; _scid_r=6iaoVJ8u3wDU365Ru7YQzAk7ZNYB3lSs; _uetsid=d053b7c0bcec11f09d98a12842379b54; _uetvid=d053d790bcec11f0ba7f6161727a8ed6; _fbp=fb.1.1762638574212.30938337974899486; _tt_enable_cookie=1; _ttp=01K9JQ4CNEZ5R86K0P4EKE38GC_.tt.1; tfpsi=6284d6e9-531b-4513-8fce-73bffb7332c5; _ScCbts=%5B%5D; DoubleClickSession=true; _pin_unauth=dWlkPU1UQmtNREpsTldJdFlXRTVNeTAwTUdVNUxUZ3hObVl0T0Rka1pXVmtNVGs1TXpNMw; _clck=b3gvfa%5E2%5Eg0u%5E0%5E2138; _sctr=1%7C1762581600000; __gads=ID=40a4177cb226c020:T=1762638577:RT=1762638577:S=ALNI_MY8OWnWs55_yW00VVMu5ZtcZp5SVw; __gpi=UID=0000128827c8dbc2:T=1762638577:RT=1762638577:S=ALNI_MbrcR81IM94rD-Ifd29lo1_RWeSWQ; __eoi=ID=54fd248f9b4c4f3c:T=1762638577:RT=1762638577:S=AA-AfjZjhV7E4EEEOfRV40MuY3Lv; _clsk=19qa3u%5E1762638580594%5E3%5E0%5Ea.clarity.ms%2Fcollect; search=6|1765230580679%7Crect%3D41.89897388058498%2C-87.60445320883179%2C41.86580854354647%2C-87.64775479116821%26rid%3D269593%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%09269593%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; ttcsid_CN5P33RC77UF9CBTPH9G=1762638574256::uqMVddcZ1KeQ3mWG5fSE.1.1762638585362.0; ttcsid=1762638574256::PJmXKE50fSXKKxe_Aoo8.1.1762638585363.0",
            "web-platform-data=%7B%22wp-dd-rum-session%22%3A%7B%22doNotTrack%22%3Atrue%7D%7D; zguid=24|%2407dba003-0280-4294-b2db-86b1d1512700; zgsession=1|96353d35-1954-454d-970a-5cb7635f9063; _ga=GA1.2.1574010895.1762638662; _gid=GA1.2.686949921.1762638662; zjs_anonymous_id=%2207dba003-0280-4294-b2db-86b1d1512700%22; zjs_user_id=null; zg_anonymous_id=%226aa1a662-c879-4bff-bfb4-1ea164c5b797%22; pxcts=0482b3f9-bced-11f0-9323-d49cccb84802; _pxvid=0482ac2a-bced-11f0-9322-ed51978c9ee8; AWSALB=YovSFU7CL8/cofo5Ip3xuDDsUJBZqkigilpnXDjB4B9Ly0f3JgH2ILnX2Qz8q2DOEaVtBZiVcND7AKjsRSAErzG1YurYgd4LVU9OycpKt5VNTzVSkD22VBixqQkK; AWSALBCORS=YovSFU7CL8/cofo5Ip3xuDDsUJBZqkigilpnXDjB4B9Ly0f3JgH2ILnX2Qz8q2DOEaVtBZiVcND7AKjsRSAErzG1YurYgd4LVU9OycpKt5VNTzVSkD22VBixqQkK; JSESSIONID=551FDB2CED6EB7E33066BBB49B4423B4; zjs_user_id_type=%22encoded_zuid%22; g_state={\"i_l\":0,\"i_ll\":1762638662387,\"i_b\":\"KT6T0mbaQu4OLSv4hWFFuVPX9bph5UMuKv+fm7+AGVI\"}; _px3=ff5b5f454a9778dbf56bdc949b0535dac61b625f5149c76f4c1f93280db67413:Kd07psUtr3WqUIyoJwpe2/u4DRcnfp7gfx1AW7wFerDmAMGajjK6ASW5BovZ1arRAd+nbVTishWzVf2La2eosg==:1000:DYH3g6qpK275pydzKRdEoQulBlvnVb0RgMANxzjzlsbiJTt2jOZVkrcc1PCnd3oYYw95GuOM4neOrkH7qC3DMs07nG9Kf6bob0IcOSyF8u1mZJmaN3kR50WNKhxBhtpA//ycUtUpFPjUMJRAm71md9oix8XJb/pEbYo32gPTr6htJHx6zh93NiSIqT33tdzuJPj93jb5sprDVK77uTRD7QPJRzTLlBpyvkn0ep/7JVJ03V1BecXM6oV1YEp8lz/DmMnc+u1P7s3+MrhGygieZw==; _gat=1; _gcl_au=1.1.11884193.1762638664; datagrail_consent_id=7e84c9ce-057e-4c91-87ef-56e6d4914637.2a31d997-a64e-4232-bd43-d787febc32c9; datagrail_consent_id_s=7e84c9ce-057e-4c91-87ef-56e6d4914637.1da2f4e4-980b-4935-bbf9-618b84fa0a9c; _rdt_uuid=1762638664130.acb8357a-155c-4441-9b87-ae05d2df1a33; _scid=C1N09sgNkC-IjuyJpuHOhu5oMHg6vnXY; _scid_r=C1N09sgNkC-IjuyJpuHOhu5oMHg6vnXY; _uetsid=060d4470bced11f0bb3a7983cc39af46; _uetvid=060d32b0bced11f0b0308d2a0a3f6703; _fbp=fb.1.1762638664381.78656258317647975; tfpsi=ce800e31-aefd-4790-aa5d-09f41d0dd9f2; DoubleClickSession=true; _ScCbts=%5B%5D; _pin_unauth=dWlkPU5XTmtaV0pqWWpndE4yTXpPQzAwWkRFMExUbG1NREF0T0dNeE9EWmtOelU0WWpGaw; _tt_enable_cookie=1; _ttp=01K9JQ74V45X98KPX1Y1WN6J1Q_.tt.1; _clck=11oejb7%5E2%5Eg0u%5E0%5E2138; __gads=ID=56a5c5d0fdd93fab:T=1762638664:RT=1762638664:S=ALNI_Mb3aOZ0R_Ti0MSvgYNESvIWHRT4iw; __gpi=UID=000012882884afe0:T=1762638664:RT=1762638664:S=ALNI_MaWXsXsenWul2_3ZNcO0lbfGEJTjg; __eoi=ID=6449cf62e528a2d3:T=1762638664:RT=1762638664:S=AA-AfjbhXH83e6Tmy9K4xy8JQbAR; _sctr=1%7C1762581600000; _clsk=qm63l%5E1762638667019%5E3%5E0%5Ea.clarity.ms%2Fcollect; search=6|1765230667074%7Crect%3D42.0253409596379%2C-87.96102538085937%2C41.493681229806924%2C-88.68886961914062%26rid%3D10215%26disp%3Dmap%26mdm%3Dauto%26p%3D1%26listPriceActive%3D1%26fs%3D1%26fr%3D0%26mmm%3D0%26rs%3D0%26singlestory%3D0%26housing-connector%3D0%26parking-spots%3Dnull-%26abo%3D0%26garage%3D0%26pool%3D0%26ac%3D0%26waterfront%3D0%26finished%3D0%26unfinished%3D0%26cityview%3D0%26mountainview%3D0%26parkview%3D0%26waterview%3D0%26hoadata%3D1%26zillow-owned%3D0%263dhome%3D0%26showcase%3D0%26featuredMultiFamilyBuilding%3D0%26onlyRentalStudentHousingType%3D0%26onlyRentalIncomeRestrictedHousingType%3D0%26onlyRentalMilitaryHousingType%3D0%26onlyRentalDisabledHousingType%3D0%26onlyRentalSeniorHousingType%3D0%26commuteMode%3Ddriving%26commuteTimeOfDay%3Dnow%09%0910215%09%7B%22isList%22%3Atrue%2C%22isMap%22%3Atrue%7D%09%09%09%09%09; ttcsid=1762638664551::hQF2O8BACTnZ546fUJOr.1.1762638668055.0; ttcsid_CN5P33RC77UF9CBTPH9G=1762638664551::nBvP13SsWb0sth5CHWr9.1.1762638668055.0",


            // … (add up to 20 variants)
        ];

        // Randomly select one cookie set from the pool
        const randomCookie = cookiePool[Math.floor(Math.random() * cookiePool.length)];

        // Define headers for the Zillow request
        return {
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/json",
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            Origin: "https://www.zillow.com",
            Cookie: randomCookie, // 👈 Randomly rotated cookie
        };
    }
    async processSnapshotsSequentially(initialScrapper: boolean) {
        this.logger.log(`🛰 Starting sequential snapshot processing (initialScrapper=${initialScrapper})`);
        let readyKeys: ReadyScrapperResponseDto[];

        // 1) grab all ready snapshot keys
        try {
            readyKeys = await this.dynamoDBService.checkReadyScrapper(initialScrapper);
            this.logger.log(`🔍 DynamoDB returned ${readyKeys.length} ready snapshots`);
        } catch (err) {
            this.logger.error(`❌ Failed to fetch ready snapshots: ${err.stack || err.message}`);
            return;
        }

        if (!readyKeys.length) {
            this.logger.log('⚠️ No ready snapshots found, nothing to do.');
            return;
        }

        // 2) for each snapshot…
        for (const key of readyKeys) {
            const { s3Key, countyId, date } = key;
            this.logger.log(`\n————————————————————————————————————\n🔄 Snapshot: s3Key=${s3Key}, countyId=${countyId}, date=${date}`);

            // a) read from S3
            let data: any[];
            try {
                data = await this.s3Service.readResults(s3Key);
                this.logger.log(`📥 Fetched raw data (${data.length} items) for ${s3Key}`);
            } catch (err) {
                this.logger.error(`❌ [${s3Key}] S3 readResults failed: ${err.stack || err.message}`);
                continue;
            }

            // b) process raw JSON
            try {
                await this.readRawData(data, countyId, initialScrapper, date);
                this.logger.log(`✨ [${s3Key}] readRawData completed`);
            } catch (err) {
                this.logger.error(`❌ [${s3Key}] readRawData failed: ${err.stack || err.message}`);
                continue;
            }

            // c) mark done in DynamoDB
            try {
                await this.dynamoDBService.markAsDone(s3Key);
                this.logger.log(`✅ [${s3Key}] marked as done in DynamoDB`);
            } catch (err) {
                this.logger.error(`❌ [${s3Key}] DynamoDB markAsDone failed: ${err.stack || err.message}`);
                // we could still continue, but you may want to break if this is critical
            }

            this.logger.log(`✔️ Snapshot ${s3Key} fully processed`);
        }

        this.logger.log(`✅ Finished processing all ${readyKeys.length} snapshots.`);
    }


}
