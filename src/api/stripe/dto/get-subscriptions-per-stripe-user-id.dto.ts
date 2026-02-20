import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { StripeSubscriptionStatus } from '../../../enums/stripe-subscription-status.enum';

export class GetSubscriptionsPerStripeUserIdDto {
  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  stripeUserId: string;

  @ApiProperty({ required: true, enum: StripeSubscriptionStatus })
  @IsEnum(StripeSubscriptionStatus)
  @IsNotEmpty()
  stripeSubscriptionStatus: StripeSubscriptionStatus;
}
