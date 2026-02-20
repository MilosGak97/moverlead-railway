import {ApiProperty} from "@nestjs/swagger";
import {IsArray, IsNotEmpty} from "class-validator";

export class GetZillowUrlsForCountyDto {
    @ApiProperty({isArray: true, type: String})
    @IsArray()
    @IsNotEmpty()
    urls: string[];
}