import {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    ScanCommand,
    UpdateItemCommand,
    UpdateItemCommandInput
} from "@aws-sdk/client-dynamodb";
import {ReadyScrapperResponseDto} from "../dto/ready-scrapper-response.dto";
import {FailedScrapperResponseDto} from "../dto/failed-scrapper-response.dto";

export class DynamoDBService {
    private dynamoDbClient: DynamoDBClient;
    private dynamoTableName = process.env.AWS_DYNAMODB_TABLE_NAME;

    constructor() {
        this.dynamoDbClient = new DynamoDBClient({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    async startedScrapperDynamo(
        key: string,
        countyId: string,
        zillowUrl: string,
        minPrice: string,
        maxPrice: string,
        initialScrapper: boolean,
    ) {
        // Write metadata to DynamoDB for real-time querying
        const dynamoParams = {
            TableName: this.dynamoTableName,
            Item: {
                s3Key: {S: key},
                status: {S: "running"},
                county: {S: countyId},
                date: {S: new Date().toISOString()},
                ml_read: {BOOL: false},
                test_read: {BOOL: false},
                attempt_count: {N: "1"},
                zillow_url: {S: zillowUrl},
                min_price: {N: minPrice},
                max_price: {N: maxPrice},
                initial_scrapper: {BOOL: initialScrapper},
            },
        };
        const putItemCommand = new PutItemCommand(dynamoParams);
        await this.dynamoDbClient.send(putItemCommand);
        console.log(` 🧊: Scrapper started and saved in DynamoDB for ${key}`);
        return key;
    }


    async successfulScrapper(key: string, numberOfResults: number) {
        // Parameters for getting the item
        const getItemParams = {
            TableName: this.dynamoTableName,
            Key: {s3Key: {S: key}},
        };

        try {
            // Check if the item exists
            const getItemCommand = new GetItemCommand(getItemParams);
            const getResult = await this.dynamoDbClient.send(getItemCommand);

            if (!getResult.Item) {
                console.log(`Item with key ${key} not found.`);
                return `Item with key ${key} not found.`;
            }

            // Update the status from "running" to "ready" AND set numberOfResults
            const updateParams: UpdateItemCommandInput = {
                TableName: this.dynamoTableName,
                Key: {s3Key: {S: key}},
                UpdateExpression: "SET #st = :status, #num = :numberOfResults",
                ExpressionAttributeNames: {
                    "#st": "status",
                    "#num": "numberOfResults",
                },
                ExpressionAttributeValues: {
                    ":status": {S: "ready"},
                    ":numberOfResults": {N: numberOfResults.toString()}, // Dynamo expects N as string
                },
                ReturnValues: "UPDATED_NEW",
            };

            const updateCommand = new UpdateItemCommand(updateParams);
            await this.dynamoDbClient.send(updateCommand);

          //  console.log(`✅ : Scrapper for ${key} was successful`);
            return key;
        } catch (error: any) {
            console.error("Error updating attempt count:", error);
            throw error;
        }
    }

    async failedScrapper(s3Key: string): Promise<string> {
        // Parameters for getting the item
        const getItemParams = {
            TableName: this.dynamoTableName,
            Key: {s3Key: {S: s3Key}},
        };

        try {
            // Check if the item exists
            const getItemCommand = new GetItemCommand(getItemParams);
            const getResult = await this.dynamoDbClient.send(getItemCommand);

            if (!getResult.Item) {
                console.log(`Item with key ${s3Key} not found.`);
                return `Item with key ${s3Key} not found.`;
            }

            // Update the status from "running" to "ready"
            const updateParams: UpdateItemCommandInput = {
                TableName: this.dynamoTableName,
                Key: {s3Key: {S: s3Key}},
                UpdateExpression: "SET #st = :status",
                ExpressionAttributeNames: {"#st": "status"},
                ExpressionAttributeValues: {":status": {S: "failed"}},
                ReturnValues: "UPDATED_NEW" as const,
            };

            const updateCommand = new UpdateItemCommand(updateParams);
            await this.dynamoDbClient.send(updateCommand);

            console.log(`❌ : Scrapper for ${s3Key} has failed!`);
            return s3Key;
        } catch (error: any) {
            console.error("Error updating attempt count:", error);
            throw error;
        }
    }

    async updateAttemptCount(s3Key: string): Promise<string> {
        // Parameters for getting the item
        const getItemParams = {
            TableName: this.dynamoTableName,
            Key: {s3Key: {S: s3Key}},
        };

        try {
            // Check if the item exists
            const getItemCommand = new GetItemCommand(getItemParams);
            const getResult = await this.dynamoDbClient.send(getItemCommand);

            if (!getResult.Item) {
                console.log(`Item with key ${s3Key} not found.`);
                return `Item with key ${s3Key} not found.`;
            }

            // Use the ADD operation to increment attempt_count by 1
            const updateParams: UpdateItemCommandInput = {
                TableName: this.dynamoTableName,
                Key: {s3Key: {S: s3Key}},
                UpdateExpression: "ADD attempt_count :inc",
                ExpressionAttributeValues: {":inc": {N: "1"}},
                ReturnValues: "UPDATED_NEW" as const,
            };

            const updateCommand = new UpdateItemCommand(updateParams);
            await this.dynamoDbClient.send(updateCommand);

            return s3Key;
        } catch (error: any) {
            console.error("Error updating attempt count:", error);
            throw error;
        }
    }


    async checkFailedScrapper(): Promise<FailedScrapperResponseDto[] | []> {
        try {
            // Parameters for scanning the DynamoDB table
            const scanParams = {
                TableName: this.dynamoTableName,
                FilterExpression: "#st = :status",
                ExpressionAttributeNames: {"#st": "status"},
                ExpressionAttributeValues: {":status": {S: "failed"}},
            };

            // Execute the scan command
            const {Items} = await this.dynamoDbClient.send(
                new ScanCommand(scanParams)
            );

            if (!Items || Items.length === 0) {
                console.log("No failed scrappers found");
                return [];
            }

            // Convert DynamoDB items to a more readable format
            const failedScrappers = Items.map((item) => ({
                s3Key: item.s3Key?.S,
                zillowUrl: item.zillow_url?.S,
                minPrice: item.min_price?.N,
                maxPrice: item.max_price?.N,
                countyId: item.county?.S,
            }));

            console.log(`Found ${failedScrappers.length} failed scrappers`);
            return failedScrappers;
        } catch (error: any) {
            console.error("Error checking failed scrappers:", error);
            throw error;
        }
    }
/*
    async checkReadyScrapper(initialScrapper: boolean): Promise<ReadyScrapperResponseDto[] | []> {
        try {
            console.log("initialScrapper being passed in:", initialScrapper);
            console.log(typeof initialScrapper)
            const scanParams = {
                TableName: this.dynamoTableName,
                FilterExpression: "#st = :status AND #ml = :mlRead AND #is = :initialScrapper",
                ExpressionAttributeNames: {
                    "#st": "status",
                    "#ml": "ml_read",
                    "#is": "initial_scrapper",
                },
                ExpressionAttributeValues: {
                    ":status": {S: "ready"},
                    ":mlRead": {BOOL: false},
                    ":initialScrapper": {BOOL: initialScrapper},
                },
            };


            // Execute the scan command
            const {Items} = await this.dynamoDbClient.send(
                new ScanCommand(scanParams)
            );

            if (!Items || Items.length === 0) {
                console.log("No ready scrappers found");
                return [];
            }

            // Convert DynamoDB items to a more readable format
            const readyScrappers = Items.map((item) => ({
                s3Key: item.s3Key?.S,
                countyId: item.county?.S,
                date: item.date?.S ? new Date(item.date.S) : undefined,
            }));

            console.log(`Found ${readyScrappers.length} ready scrappers`);
            return readyScrappers;
        } catch (error: any) {
            console.error("Error checking failed scrappers:", error);
            throw error;
        }
    }


 */
    async checkReadyScrapper(initialScrapper: boolean): Promise<ReadyScrapperResponseDto[]> {
        try {
            const readyScrappers: ReadyScrapperResponseDto[] = [];
            let ExclusiveStartKey = undefined;
            const configuredLimit = Number(process.env.READY_SCRAPPER_SCAN_LIMIT ?? '0');
            const maxScannedItems = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : null;
            let totalScanned = 0;
            let page = 0;

            if (maxScannedItems) {
                console.log(`🔒 Scan safety limit enabled: ${maxScannedItems}`);
            }

            do {
                page++;
                const scanParams = {
                    TableName: this.dynamoTableName,
                    FilterExpression: "#st = :status AND #ml = :mlRead AND #is = :initialScrapper",
                    ExpressionAttributeNames: {
                        "#st": "status",
                        "#ml": "ml_read",
                        "#is": "initial_scrapper",
                    },
                    ExpressionAttributeValues: {
                        ":status": { S: "ready" },
                        ":mlRead": { BOOL: false },
                        ":initialScrapper": { BOOL: initialScrapper },
                    },
                    ExclusiveStartKey, // continue from previous page
                };

                const { Items, LastEvaluatedKey, ScannedCount } = await this.dynamoDbClient.send(
                    new ScanCommand(scanParams)
                );

                const scannedThisPage = ScannedCount ?? 0;
                totalScanned += scannedThisPage;

                if (Items && Items.length > 0) {
                    const mapped = Items.map((item) => ({
                        s3Key: item.s3Key?.S,
                        countyId: item.county?.S,
                        date: item.date?.S ? new Date(item.date.S) : undefined,
                    }));
                    readyScrappers.push(...mapped);
                }

                console.log(`📄 Page ${page}: Scanned ${scannedThisPage}, Total Scanned So Far: ${totalScanned}, Ready So Far: ${readyScrappers.length}`);

                ExclusiveStartKey = LastEvaluatedKey;

                if (maxScannedItems && totalScanned >= maxScannedItems) {
                    console.warn(`⚠️ Scan limit of ${maxScannedItems} reached. Stopping early.`);
                    break;
                }

            } while (ExclusiveStartKey);

            console.log(`✅ Total ready scrappers found: ${readyScrappers.length}`);
            return readyScrappers;
        } catch (error: any) {
            console.error("❌ Error checking ready scrappers:", error);
            throw error;
        }
    }


    async markAsDone(key: string) {
        // Parameters for getting the item
        const getItemParams = {
            TableName: this.dynamoTableName,
            Key: {s3Key: {S: key}},
        };

        try {
            // Check if the item exists
            const getItemCommand = new GetItemCommand(getItemParams);
            const getResult = await this.dynamoDbClient.send(getItemCommand);

            if (!getResult.Item) {
                console.log(`Item with key ${key} not found.`);
                return `Item with key ${key} not found.`;
            }

            // Update the ml_read attribute to true using SET
            const updateParams: UpdateItemCommandInput = {
                TableName: this.dynamoTableName,
                Key: {s3Key: {S: key}},
                UpdateExpression: "SET ml_read = :ml",
                ExpressionAttributeValues: {
                    ":ml": {BOOL: true},
                },
                ReturnValues: "UPDATED_NEW" as const,
            };

            const updateCommand = new UpdateItemCommand(updateParams);
            await this.dynamoDbClient.send(updateCommand);

            console.log(`ml_read updated to true for key ${key}`);
            return key;
        } catch (error: any) {
            console.error("Error updating ml_read:", error);
            throw error;
        }
    }
}
