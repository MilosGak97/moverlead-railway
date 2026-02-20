import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export interface Region {
  regionId: number;
  regionType: number;
}

export class GetZillowMapDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  custom_url: string;
}
