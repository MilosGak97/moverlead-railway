import { Module } from "@nestjs/common";
import { EmailService } from "./services/email.service";
import { AwsController } from "./aws.controller";
import { HttpModule } from "@nestjs/axios";
import { CountyRepository } from "src/repositories/county.repository";
import { DynamoDBService } from "./services/dynamo-db.service";
import { S3Service } from "./services/s3.service";

@Module({
  imports: [HttpModule],
  providers: [EmailService, CountyRepository, DynamoDBService, S3Service],
  exports: [EmailService, DynamoDBService, S3Service],
  controllers: [AwsController],
})
export class AwsModule {}
