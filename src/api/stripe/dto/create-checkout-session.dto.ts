import { IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateCheckoutSessionDto {
  @ApiProperty({ required: true, isArray: true, type: 'string' })
  @IsNotEmpty()
  @IsArray()
  @Transform(({ value }) => {
    if (!value) return [];
    return Array.isArray(value) ? value.flat() : [value];
  })
  priceIds: string[];


}
