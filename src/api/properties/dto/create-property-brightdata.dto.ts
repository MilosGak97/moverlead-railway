import { ApiProperty } from '@nestjs/swagger';
import { County } from '../../../entities/county.entity';
import { IsBoolean, IsDate, IsNotEmpty, IsOptional } from "class-validator";
import { User } from '../../../entities/user.entity';
import { FilteredStatus } from '../../../enums/filtered-status.enum';
import { Type } from 'class-transformer';
import { Column } from "typeorm";

export class CreatePropertyBrightdataDto {
  @ApiProperty({ required: true })
  county: County;

  @ApiProperty({ required: false })
  @IsOptional()
  filteredStatus: FilteredStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  filteredStatusDate: Date;

  /* GETTING FROM PRECISELY API */
  @ApiProperty({ required: false })
  @IsOptional()
  ownerFirstName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  ownerLastName: string;

  /* GETTING FROM ZILLOW BRIGHT DATA API */
  @ApiProperty({ required: false })
  @Type(() => String)
  zpid: string;

  @ApiProperty({ required: false })
  @IsOptional()
  streetAddress?: string; // streetAddress

  @ApiProperty({ required: false })
  @Type(() => String)
  @IsOptional()
  zipcode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  bedrooms?: number;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  bathrooms?: number;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  homeType?: string; // homeType

  @ApiProperty({ required: false })
  @IsOptional()
  homeStatus?: string; // homeStatus

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  homeStatusDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  isOffMarket: boolean;

  @ApiProperty({ required: false })
  @Type(() => String)
  parcelId?: string; // parcelId

  @ApiProperty({ required: false })
  @IsOptional()
  realtorName?: string; // listing_provided_by.name

  @ApiProperty({ required: false })
  @Type(() => String)
  @IsOptional()
  realtorPhone?: string; // listing_provided_by.phone

  @ApiProperty({ required: false })
  @IsOptional()
  realtorCompany?: string; // listing_provided_by.phone_number

  @ApiProperty({ required: false })
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  hasBadGeocode?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  isUndisclosedAddress?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  isNonOwnerOccupied?: boolean;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  livingAreaValue?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  livingAreaUnitsShort?: string;

  @ApiProperty({ required: false })
  @Type(() => Number)
  @IsOptional()
  daysOnZillow?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  brokerageName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  propertyTypeDimension?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  hdpTypeDimension?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  listingTypeDimension?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  countyZillow: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsBoolean()
  initialScrape?: boolean;

  @ApiProperty({ required: false })
  @Type((): NumberConstructor => Number)
  @IsOptional()
  photoCount?: number; // photoCount

  @ApiProperty({ required: false })
  @IsOptional()
  photos?: any[];
}
