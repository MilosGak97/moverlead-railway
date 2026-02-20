import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsNumber, IsString} from "class-validator";
import {Type} from "class-transformer";

export class FailedScrapperResponseDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    s3Key: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    zillowUrl: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    minPrice: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    maxPrice: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsNumber()
    countyId: string;
}