import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PostcardShippingType } from '../../../enums/postcard-shipping-type.enum';
import { PostcardSize } from '@lob/lob-typescript-sdk';
import { Transform, Type } from 'class-transformer';

export class GetPostcardsPaginatedDto {
  @ApiPropertyOptional({ description: 'ISO start date for send_date filter' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO end date for send_date filter' })
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

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;
}
