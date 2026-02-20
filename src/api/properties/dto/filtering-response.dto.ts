import {ApiExtraModels, ApiProperty} from '@nestjs/swagger';
import {Property} from '../../../entities/property.entity';
import {IsArray, IsNotEmpty, IsNumber} from 'class-validator';
import {Type} from "class-transformer";
import {FilteringObjectDto} from "./filtering-object.dto";

@ApiExtraModels(FilteringObjectDto)
export class FilteringResponseDto {
    @ApiProperty({required: true, type: [FilteringObjectDto]})
    @IsArray()
    @IsNotEmpty()
    result: FilteringObjectDto[];

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor => Number)
    totalRecords: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor => Number)
    currentPage: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor => Number)
    totalPages: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor => Number)
    limit: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor => Number)
    offset: number;
}
