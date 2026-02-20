import {forwardRef, Module} from "@nestjs/common";
import { ScrapperController } from "./scrapper.controller";
import { ScrapperService } from "./scrapper.service";
import { HttpModule } from "@nestjs/axios";
import { PropertiesModule } from "../properties/properties.module";
import { AwsModule } from "../aws/aws.module";
import { BullModule } from "@nestjs/bull";
import { ScrapperProcessor } from "./scrapper.processor";
import {BrightdataService} from "./brightdata.service";
import {HasdataService} from "./hasdata.service";
import {S3Service} from "../aws/services/s3.service";

@Module({
  imports: [
    HttpModule,
    forwardRef(() => PropertiesModule),
    AwsModule,
    BullModule.registerQueue({
      name: "scrapper",
    }),
  ],
  controllers: [ScrapperController],
  providers: [ScrapperService, ScrapperProcessor, BrightdataService, HasdataService, S3Service],
  exports: [ScrapperService, BrightdataService],
})
export class ScrapperModule {}
