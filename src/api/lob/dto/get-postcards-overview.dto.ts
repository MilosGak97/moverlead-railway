import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PostcardShippingType } from '../../../enums/postcard-shipping-type.enum';
import { PostcardSize } from '@lob/lob-typescript-sdk';
import { Transform } from 'class-transformer';

export class GetPostcardsOverviewDto {
  @ApiPropertyOptional({ description: 'ISO start date for date_created filter' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO end date for date_created filter' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ type: [String], description: 'Filter by postcard template ids (metadata)' })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  postcardTemplateIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Filter by postcard sizes' })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(PostcardSize, { each: true })
  postcardSizes?: PostcardSize[];

  @ApiPropertyOptional({ type: [String], description: 'Filter by state metadata' })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  states?: string[];

  @ApiPropertyOptional({ enum: PostcardShippingType })
  @IsOptional()
  @IsEnum(PostcardShippingType)
  mailType?: PostcardShippingType;
}
