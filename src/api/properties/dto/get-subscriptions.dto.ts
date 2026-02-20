import { ApiProperty } from '@nestjs/swagger';
import { StripeSubscriptionStatus } from '../../../enums/stripe-subscription-status.enum';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class GetSubscriptionsDto {
  @ApiProperty({ required: true, enum: StripeSubscriptionStatus })
  @IsNotEmpty()
  @IsEnum(StripeSubscriptionStatus)
  stripeSubscriptionStatus: StripeSubscriptionStatus;
}
