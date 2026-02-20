import {BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors} from "@nestjs/common";
import {ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags} from "@nestjs/swagger";
import { FailedScrapperResponseDto } from "./dto/failed-scrapper-response.dto";
import { DynamoDBService } from "./services/dynamo-db.service";
import {S3Service} from "./services/s3.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {uuid4} from "openai/internal/utils/uuid";
import { v4 as uuidv4 } from 'uuid';
import {UploadFileResponseDto} from "./dto/upload-file-response.dto";
import {CheckFilesDto} from "./dto/check-files.dto";

@ApiTags("aws")
@Controller("aws")
export class AwsController {
  constructor(
    private readonly dynamoDBService: DynamoDBService,
    private readonly s3Service:  S3Service,
  ) {}

  @Get("read-results/:key")
  async readResults(@Param("key") key: string) {
    return await this.s3Service.readResults(key);
  }

  @Get("snapshots/failed")
  @ApiOkResponse({ type: FailedScrapperResponseDto })
  async checkFailedScrapper() {
    return await this.dynamoDBService.checkFailedScrapper();
  }
  @ApiOperation({ summary: 'Upload file for template of postcards' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOkResponse({ type: UploadFileResponseDto })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const key = `${uuidv4()}`;
    return await this.s3Service.uploadFile(file.buffer, key, file.mimetype);
}



    @Post("check-files")
    @ApiOperation({ summary: "Check if specific S3 files exist in the bucket" })
    async checkFiles(@Body() body: CheckFilesDto) {
        const {keys} = body;
        const result = await this.s3Service.checkFilesExist(keys);

        return {
            message: "S3 file existence check completed successfully",
            bucket: process.env.AWS_S3_BUCKET_NAME,
            ...result,
        };
    }

    @Post('download')
    @ApiOperation({ summary: "Download S3 files" })
    async downloadSnapshots(@Body() body: CheckFilesDto) {
        if (!body.keys || !Array.isArray(body.keys) || !body.keys.length) {
            throw new Error('Invalid body: expected { "keys": [ ... ] }');
        }

        const result = await this.s3Service.downloadFiles(body.keys);
        return {
            message: 'Snapshots downloaded successfully',
            savedFiles: result,
        };
    }

}
