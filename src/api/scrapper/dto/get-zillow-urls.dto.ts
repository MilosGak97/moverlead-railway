import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class GetZillowUrlsDto {
  @ApiProperty()
  @IsOptional()
  priceIds: string[];
}
