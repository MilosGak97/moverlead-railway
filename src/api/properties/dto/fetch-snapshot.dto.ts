import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DaysOnZillow } from '../../../enums/days-on-zillow.enum';

export class FetchSnapshotDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ required: true, enum: DaysOnZillow })
  @IsEnum(DaysOnZillow)
  @IsNotEmpty()
  daysOnZillow: DaysOnZillow;
}
