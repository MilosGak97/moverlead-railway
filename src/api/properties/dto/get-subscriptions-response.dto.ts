import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionItemsDto } from './subscription-items.dto';

@ApiExtraModels(SubscriptionItemsDto)
export class GetSubscriptionsResponseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  id: string;

  @ApiProperty({ required: false, description: 'Unix timestamp in seconds' })
  @IsOptional()
  @IsDate()
  currentPeriodStart: Date;

  @ApiProperty({ required: false, description: 'Unix timestamp in seconds' })
  @IsOptional()
  @IsDate()
  currentPeriodEnd: Date;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @Type(() => String)
  status: string;

  @ApiProperty({ required: false, type: [SubscriptionItemsDto] })
  @IsOptional()
  subscriptionItems: SubscriptionItemsDto[];

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  totalPrice: number;
}
