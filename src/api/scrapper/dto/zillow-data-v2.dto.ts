import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsString} from "class-validator";

export class ZillowDataV2Dto{
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    countyId: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    zillowUrl: string;

    @ApiProperty()
    zillowMinPrice: number;

    @ApiProperty()
    zillowMaxPrice: number;

}