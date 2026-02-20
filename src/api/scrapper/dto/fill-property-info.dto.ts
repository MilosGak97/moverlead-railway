import {ApiProperty} from "@nestjs/swagger";
import {IsBoolean, IsNumber, IsNumberString, IsOptional, IsString} from "class-validator";
import {Type} from "class-transformer";

export class FillPropertyInfoDto{
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    streetAddress?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    zipcode?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    bedrooms?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    bathrooms?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumberString()
    @Type(() => String)
    price?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    homeType?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    brokerageName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Type(() => String)
    latitude?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Type(() => String)
    longitude?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Type(() => String)
    livingAreaValue?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    daysOnZillow?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Type(() => String)
    timeOnZillow?: string;

}