import {ApiProperty} from "@nestjs/swagger";
import {BrightdataVersion} from "../../../enums/brightdata-version.enum";
import {IsEnum, IsNotEmpty} from "class-validator";

export class BrightdataEnrichmentTriggerDto {
    @ApiProperty({
        required: true,
        enum: BrightdataVersion,
        enumName: 'BrightdataVersion'
    })
    @IsNotEmpty()
    @IsEnum(BrightdataVersion)
    brightdataVersion: BrightdataVersion;
}