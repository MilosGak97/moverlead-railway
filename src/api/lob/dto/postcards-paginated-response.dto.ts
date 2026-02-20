import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { PostcardListItemDto } from './postcard-list-item.dto';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber } from 'class-validator';

@ApiExtraModels(PostcardListItemDto)
export class PostcardsPaginatedResponseDto {
  @ApiProperty({ type: [PostcardListItemDto] })
  @IsNotEmpty()
  @IsArray()
  result: PostcardListItemDto[];

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
