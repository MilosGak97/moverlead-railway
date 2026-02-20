import { ApiProperty } from '@nestjs/swagger';
import {IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional} from 'class-validator';
import { PropertyStatus } from '../../../enums/property-status.enum';
import { Transform, Type } from 'class-transformer';
import { FilteredStatus } from '../../../enums/filtered-status.enum';
import {PropertyType} from "../../../enums/property-type.enum";

export class GetListingsDto {
  @ApiProperty({ required: false, isArray: true, enum: FilteredStatus })
  @IsEnum(FilteredStatus, { each: true })
  @IsOptional()
  filteredStatus: FilteredStatus[];

  @ApiProperty({ required: false, isArray: true, enum: PropertyStatus })
  @IsEnum(PropertyStatus, { each: true })
  @IsOptional()
  propertyStatus: PropertyStatus[];

  @ApiProperty({required: false, isArray: true, enum: PropertyType })
  @IsEnum(PropertyType, { each: true })
  @IsOptional()
  propertyType: PropertyType[];


  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return []; // If undefined or null, return an empty array
    return Array.isArray(value) ? value : [value]; // Ensure it's always an array
  })
  state: string[];

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  propertyValueFrom: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  propertyValueTo: number;

  @ApiProperty({ required: false })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  dateFrom: Date; // check home status date field

  @ApiProperty({ required: false })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value)) // Handle empty string
  dateTo: Date; // check home status date field



  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset: number;
}
