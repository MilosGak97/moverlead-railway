import {ApiProperty} from "@nestjs/swagger";
import {IsEnum, IsNotEmpty, IsString} from "class-validator";
import {Type} from "class-transformer";
import {BrightdataVersion} from "../../../enums/brightdata-version.enum";

export class BrightdataEnrichmentFillerDto {
    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsString()
    @Type((): StringConstructor => String)
    snapshotId: string;

    @ApiProperty({required: true, enum: BrightdataVersion})
    @IsNotEmpty()
    @IsEnum(BrightdataVersion)
    brightdataVersion: BrightdataVersion;
}