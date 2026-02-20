import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SubscriptionItemsDto {
  @ApiProperty({ required: true })
  @IsString()
  @Type(() => String)
  name: string;

  @ApiProperty({ required: true })
  @IsNumber()
  @Type(() => Number)
  price: number;
}
