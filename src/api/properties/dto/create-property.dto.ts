import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDate,
  IsNotEmpty, IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { County } from "src/entities/county.entity";
import {Type} from "class-transformer";

export class CreatePropertyDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  zpid: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  county: County;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  initialScrape: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  comingSoonDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  forSaleDate?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  pendingDate?: Date;

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
  @IsString()
  @Type(() => Number)
  price?: number;

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
