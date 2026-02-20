import { ApiProperty } from "@nestjs/swagger";
import { IsArray, ArrayNotEmpty, IsString } from "class-validator";

export class CheckFilesDto {
    @ApiProperty({
        description: "Array of S3 file keys to verify existence in the bucket",
        example: ["snapshot_TMVP5xbZeF.json", "snapshot_7vCXMVfDPM.json"]
    })
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    keys: string[];
}