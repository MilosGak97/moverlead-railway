import {BadRequestException, forwardRef, Inject, Injectable} from "@nestjs/common";
import {PropertiesService} from "../properties/properties.service";
import axios from "axios";
import {BrightdataVersion} from "../../enums/brightdata-version.enum";
import {FillBrightdataDto} from "./dto/fill-brightdata-dto";
import {S3Service} from "../aws/services/s3.service";

@Injectable()
export class BrightdataService {
    constructor(
        @Inject(forwardRef(() => PropertiesService))
        private readonly propertiesService: PropertiesService,
        private readonly s3Service: S3Service,
    ) {

    }

    /*
    async brightdataEnrichmentTrigger(brightdataVersion: BrightdataVersion) {
       const urls: { url: string }[] = await this.propertiesService.getAllEnrichmentUrls();

        if (!Array.isArray(urls) || (urls.length == 0) || !urls) {
            return null;
        }

        console.log("NUMBER OF URLS  THAT NEED TO BE SCRAPPED ARE: " + urls.length);

        return await this.brightdataSnapshotTrigger(brightdataVersion, urls)
    }
     */

    async brightdataEnrichmentTrigger(brightdataVersion: BrightdataVersion) {
        const urls: { url: string }[] = await this.propertiesService.getAllEnrichmentUrls();

        if (!Array.isArray(urls) || urls.length === 0) {
            return null;
        }

        console.log("NUMBER OF URLS THAT NEED TO BE SCRAPED: " + urls.length);

        const chunkSize = 2000;
        const results = [];

        for (let i = 0; i < urls.length; i += chunkSize) {
            const chunk = urls.slice(i, i + chunkSize);
            console.log(`Sending chunk ${i / chunkSize + 1} with ${chunk.length} URLs`);
            const result = await this.brightdataSnapshotTrigger(brightdataVersion, chunk);
            results.push(result);
        }

        return results;
    }


    async brightdataEnrichmentFiller(brightdataVersion: BrightdataVersion, snapshotId: string) {
        const rawData = await this.s3Service.readBrightdataSnapshot(snapshotId);

        if (!Array.isArray(rawData) || rawData.length === 0) {
            throw new BadRequestException('Array is empty or invalid, it should contain properties in the raw data');
        }

        const batchSize = 20;

        // Process the raw data in batches
        for (let i = 0; i < rawData.length; i += batchSize) {
            const batch = rawData.slice(i, i + batchSize);

            // Map over each item in the current batch and convert it to a Promise
            const batchPromises = batch.map(async (raw) => {
                // Skip record if zpid is missing.
                if (!raw.zpid) {
                    console.warn('Skipping record due to missing zpid:', raw);
                    return; // Return early for this record.
                }

                let data: FillBrightdataDto;

                if (brightdataVersion === BrightdataVersion.BRIGHTDATA_DATASET_ID_V1) {
                    data = {
                        zpid: raw.zpid.toString(),
                        parcelId: raw.parcelId,
                        realtorName: raw.listing_provided_by?.name,
                        realtorPhone: raw.listing_provided_by?.phone_number,
                        brokerageName: raw.listing_provided_by?.company,
                        countyZillow: raw.county,
                        photoCount: raw.photoCount,
                        photos: Array.isArray(raw.photos)
                            ? raw.photos
                                .map((photo) => photo?.mixedSources?.jpeg?.[1]?.url)
                                .filter((url) => url)
                            : []
                    };
                } else if (brightdataVersion === BrightdataVersion.BRIGHTDATA_DATASET_ID_V2) {
                    data = {
                        zpid: raw.zpid.toString(),
                        parcelId: raw.parcel_id,
                        realtorName: raw.attribution_info?.agent_name,
                        realtorPhone: raw.attribution_info?.agent_phone_number,
                        brokerageName: raw.attribution_info?.broker_name,
                        brokeragePhone: raw.attribution_info?.broker_phone_number,
                        countyZillow: raw.county,
                        photoCount: raw.photo_count,
                        photos: Array.isArray(raw.responsive_photos)
                            ? raw.responsive_photos
                                .map((photo) => photo?.mixed_sources?.jpeg?.[1]?.url)
                                .filter((url) => url)
                            : []
                    };
                }

                // Save the data for the current raw record in your database.
                await this.propertiesService.fillBrightdata(data, brightdataVersion);
            });

            // Await the current batch to finish before starting the next one.
            await Promise.all(batchPromises);
        }
    }


    private async brightdataSnapshotTrigger(brightdataVersion: BrightdataVersion, urls: {
        url: string
    }[]): Promise<string> {
        if (!Array.isArray(urls) || !urls || urls.length === 0) {
            throw new BadRequestException('Payload must not be empty');
        }
        const url =
            'https://api.brightdata.com/datasets/v3/trigger' +
            `?dataset_id=${process.env[brightdataVersion]}` +
            '&notify=https%3A%2F%2Fapi.moverlead.com%2Fstripe%2Fwebhook' +
            '&include_errors=true';

        const headers = {
            Authorization: `Bearer ${process.env.BRIGHTDATA_TOKEN}`,
            'Content-Type': 'application/json',
        };

        const data = {
            deliver: {
                type: 's3',
                filename: {
                    template: '{[snapshot_id]}',
                    extension: 'json',
                },
                bucket: process.env.AWS_S3_BUCKET_NAME_BRIGHTDATA,
                credentials: {
                    'aws-access-key': process.env.AWS_ACCESS_KEY_ID,
                    'aws-secret-key': process.env.AWS_SECRET_ACCESS_KEY,
                },
                directory: '',
            },
            input: urls,
        };

        try {
            const response = await axios.post(url, data, {headers});
            console.log('✅ BrightData Trigger Success from Scrapper Service:', response.data.snapshot_id);
            return response.data.snapshot_id;
        } catch (error) {
            console.error('❌ BrightData Trigger Failed:', error.response?.data || error.message);
            throw error;
        }
    }
}