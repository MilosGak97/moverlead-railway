import {ApiProperty} from "@nestjs/swagger";
import {IsArray, IsDate, IsEnum, IsNotEmpty, IsNumber, IsNumberString, IsOptional, IsString} from "class-validator";
import {Type} from "class-transformer";
import {FilteredStatus} from "../../../enums/filtered-status.enum";
import {statesArray} from "./states.array";
import {PropertyStatus} from "../../../enums/property-status.enum";

export class GetListingObjectDto {
    // propertyid + status (comingsoon, forsale, pending)
    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsNumberString()
    @Type(() => String)
    id: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    @Type(() => String)
    fullName: string;

    @ApiProperty({required: false, enum: FilteredStatus})
    @IsOptional()
    @IsEnum(FilteredStatus)
    filteredStatus: FilteredStatus | string;

    @ApiProperty({required: true, enum: PropertyStatus})
    @IsNotEmpty()
    @IsEnum(PropertyStatus)
    propertyStatus: PropertyStatus;

    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsString()
    propertyStatusDate: string;

    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsString()
    fullAddress: string;

    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsString()
    state: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    bedrooms: number;

    @ApiProperty({required: false})
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    bathrooms: number;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Type(() => String)
    price: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Type(() => String)
    homeType: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    realtorName: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Type(() => String)
    realtorPhone: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    brokerageName: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Type(() => String)
    brokeragePhone: string;
}