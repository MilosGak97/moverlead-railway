// src/api/property/dto/fill-brightdata.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {IsOptional, IsString, IsNumber, IsBoolean} from 'class-validator';
import {Type} from "class-transformer";

export class FillBrightdataDto {
    @ApiProperty({ required: true })
    @IsString()
    zpid: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    parcelId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    realtorName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    realtorPhone?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    brokerageName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    brokeragePhone?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    countyZillow?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    photoCount?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    photos?: string[];
}
