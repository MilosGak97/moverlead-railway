import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
    ObjectCannedACL, HeadObjectCommand
} from "@aws-sdk/client-s3";
import {Readable} from "stream";
import {safeStringify} from "src/api/common/utils/safe-stringify";
import {BadRequestException} from "@nestjs/common";
import { promises as fs } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';


// stream-json imports:
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import {UploadFileResponseDto} from "../dto/upload-file-response.dto";


export class S3Service {
    private s3Client: S3Client;

    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    async uploadCsvFromBuffer(
        csv: string | Buffer,
        key: string,
        tags: Record<string, string> = {},
    ): Promise<string> {
        const tagging = Object.entries({ date: new Date().toISOString(), ...tags })
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');

        await this.s3Client.send(new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME!,
            Key: key,
            Body: typeof csv === 'string' ? Buffer.from(csv, 'utf8') : csv,
            ContentType: 'text/csv',
            ContentDisposition: `attachment; filename="${key.split('/').pop()}"`,
            Tagging: tagging,
        }));

        return `s3://${process.env.AWS_S3_BUCKET_NAME}/${key}`;
    }


    async uploadResults(
        results: any,
        key: string
    ): Promise<string> {
        // Create a tagging string in the format: key1=value1&key2=value2
        // Note: Values are URL-encoded to ensure proper transmission
        /*
        const tagging = `status=ready&date=${encodeURIComponent(
            new Date().toISOString()
        )}&county=${countyId}&initial_scrapper=${initialScrapper}`;
*/
        // Prepare the S3 PutObject parameters, using Tagging instead of Metadata
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME, // Ensure this is set in your environment variables
            Key: key,
            Body: JSON.stringify(results, null, 2),
            ContentType: "application/json",
           // Tagging: tagging,
        };

        try {
            const command = new PutObjectCommand(params);
            await this.s3Client.send(command);
            console.log(`⬆️ ✅ Results uploaded: ${key}`);
            return `s3://${params.Bucket}/${key}`;
        } catch (error) {
            console.error(`❌ Upload failed for ${key}:`, error);
            await new Promise(res => setTimeout(res, 500));
            console.log(`↩️ Retrying upload for ${key}`);
            const command = new PutObjectCommand(params);
            await this.s3Client.send(command);
            return `s3://${params.Bucket}/${key}`;
        }
    }

    async readResults(key: string): Promise<any> {
        const params = {Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key};

        try {
            const command = new GetObjectCommand(params);
            const response = await this.s3Client.send(command);

            // Convert stream to string
            const streamToString = (stream: Readable): Promise<string> =>
                new Promise((resolve, reject) => {
                    const chunks: Uint8Array[] = [];
                    stream.on("data", (chunk) => chunks.push(chunk));
                    stream.on("end", () =>
                        resolve(Buffer.concat(chunks).toString("utf-8"))
                    );
                    stream.on("error", reject);
                });

            const data = await streamToString(response.Body as Readable);
            return JSON.parse(data);
        } catch (error) {
            console.error(`❌ Error reading JSON from S3 (${key}):`, error);
            throw new Error("Could not read JSON file from S3");
        }
    }


    async uploadErrorToS3(error: any, countyId: string, key: string) {
        // Create a tagging string in the format: key1=value1&key2=value2
        // Note: Values are URL-encoded to ensure proper transmission
        const date = new Date().toISOString();
        const tagging = `date=${date}&county=${countyId}&key=${key}`;

        // Prepend "error/" to store the file in the error folder
        const errorKey = `error/${key}_${date}`;

        const body = safeStringify(error);

        // Prepare the S3 PutObject parameters, using Tagging instead of Metadata
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME, // Ensure this is set in your environment variables
            Key: errorKey,
            Body: body,
            ContentType: "application/json",
            Tagging: tagging,
        };

        try {
            const command = new PutObjectCommand(params);
            await this.s3Client.send(command);
            return `s3://${params.Bucket}/${key}`;
        } catch (error) {
            console.error("Error uploading file to S3:", error);
            throw new Error("Could not upload results to S3");
        }
    }

    async readBrightdataSnapshot(snapshot_id: string) {
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME_BRIGHTDATA,
            Key: snapshot_id
        };

        let response;

        try {
            const command = new GetObjectCommand(params);
            response = await this.s3Client.send(command);
        } catch (err) {
            console.error(`❌ Error fetching S3 object (${snapshot_id}):`, err);
            throw new BadRequestException(`Cannot fetch S3 object for key: ${snapshot_id}`);
        }

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new BadRequestException(`S3 object for key "${snapshot_id}" has no readable body.`);
        }

        // response.Body is a Readable stream of bytes
        const bodyStream = response.Body as Readable;

        // We will pipe this through stream-json to parse a root-level array
        const pipeline = chain([
            bodyStream,      // raw S3 stream
            parser(),        // tokenize JSON
            streamArray(),   // emit one { key, value } per array element
            // extract just the "value" (the object itself)
            ({ value }: { key: number; value: any }) => value,
        ]);

        // Collect parsed items into results[]
        const results: any[] = [];

        return new Promise((resolve, reject) => {
            pipeline.on('data', (item) => {
                results.push(item);
            });

            pipeline.on('end', () => {
                // Finished parsing entire array
                resolve(results);
            });

            pipeline.on('error', (err) => {
                console.error(`❌ Error while streaming/parsing JSON from S3 (${snapshot_id}):`, err);
                reject(new BadRequestException(`Failed to stream/parse JSON from S3: ${err.message}`));
            });
        });

    }

    async uploadFile(
        buffer: Buffer,
        key: string,
        contentType: string
    ): Promise<UploadFileResponseDto>{
        const params = {
            Bucket: process.env.AWS_S3_FILES_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          //  ACL: 'public-read' as ObjectCannedACL, // 👈 the fix
        };

        try {
            const command = new PutObjectCommand(params);
            await this.s3Client.send(command);

            const url = `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

            return {
                id: key,
                url,
            };
        } catch (error) {
            console.error('S3 upload failed:', error);
            throw new Error('File upload failed');
        }
    }



    async checkFilesExist(keys: string[]): Promise<{
        foundCount: number;
        missingCount: number;
        found: string[];
        missing: string[];
    }> {
        const found: string[] = [];
        const missing: string[] = [];

        if (!Array.isArray(keys) || keys.length === 0) {
            throw new BadRequestException("You must provide a non-empty array of S3 keys.");
        }

        const bucket = process.env.AWS_S3_BUCKET_NAME;

        for (const key of keys) {
            try {
                const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
                await this.s3Client.send(command);
                found.push(key);
            } catch (error: any) {
                if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
                    missing.push(key);
                } else {
                    console.error(`⚠️ Error checking ${key}:`, error.message || error);
                }
            }
        }

        return {
            foundCount: found.length,
            missingCount: missing.length,
            found,
            missing,
        };
    }

    async downloadFiles(keys: string[], localDir = './tmp/snapshots'): Promise<string[]> {
        const bucket = process.env.AWS_S3_BUCKET_NAME;
        if (!bucket) throw new Error('AWS_S3_BUCKET_NAME not set');

        await fs.mkdir(localDir, { recursive: true });
        const savedPaths: string[] = [];

        for (const key of keys) {
            const filePath = path.join(localDir, path.basename(key));
            try {
                const command = new GetObjectCommand({ Bucket: bucket, Key: key });
                const response = await this.s3Client.send(command);

                if (!response.Body) throw new Error(`Empty response for ${key}`);

                // Stream the file to disk
                const bodyStream = response.Body as Readable;
                const writeStream = await fs.open(filePath, 'w');
                await pipeline(bodyStream, writeStream.createWriteStream());
                await writeStream.close();

                console.log(`⬇️ Downloaded ${key} → ${filePath}`);
                savedPaths.push(filePath);
            } catch (error) {
                console.error(`❌ Failed to download ${key}:`, error);
            }
        }

        return savedPaths;
    }
}
