import { ApiProperty } from '@nestjs/swagger';
import { PostcardSize } from '@lob/lob-typescript-sdk';
import { PostcardShippingType } from '../../../enums/postcard-shipping-type.enum';
import { PostcardTrackingStatus } from '../enums/postcard-tracking-status.enum';

class PostcardThumbnailDto {
  @ApiProperty({ nullable: true })
  large: string | null;
}

class PostcardRecipientDto {
  @ApiProperty({ example: 'CURRENT RESIDENT' })
  name: string;

  @ApiProperty({ example: '133 PINE LEAF DR' })
  addressLine1: string;

  @ApiProperty({ example: 'SAINT AUGUSTINE' })
  city: string;

  @ApiProperty({ example: 'FL' })
  state: string;

  @ApiProperty({ example: '32092-1460' })
  zip: string;

  @ApiProperty({ example: 'UNITED STATES' })
  country: string;
}

class PostcardTrackingEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dateCreated: string;

  @ApiProperty()
  dateModified: string;

  @ApiProperty()
  object: string;

  @ApiProperty()
  type: string;

  @ApiProperty({
    enum: [
      'Mailed',
      'In Transit',
      'In Local Area',
      'Processed for Delivery',
      'Delivered',
      'Re-Routed',
      'Returned to Sender',
      'International Exit',
    ],
  })
  name: string;

  @ApiProperty()
  time: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ nullable: true })
  location?: string | null;

  @ApiProperty({ nullable: true })
  details?: Record<string, any> | null;
}

export class PostcardDetailResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: [PostcardThumbnailDto] })
  thumbnails: PostcardThumbnailDto[];

  @ApiProperty({ type: PostcardRecipientDto })
  recipient: PostcardRecipientDto;

  @ApiProperty({ enum: PostcardSize })
  size: PostcardSize;

  @ApiProperty({ enum: PostcardShippingType })
  mailType: PostcardShippingType;

  @ApiProperty()
  dateCreated: string;

  @ApiProperty({ nullable: true })
  sendDate?: string | null;

  @ApiProperty({ nullable: true })
  expectedDeliveryDate?: string | null;

  @ApiProperty({ nullable: true })
  description?: string | null;

  @ApiProperty({ nullable: true })
  qrCodeUrl?: string | null;

  @ApiProperty({ type: [PostcardTrackingEventDto], nullable: true })
  trackingEvents?: PostcardTrackingEventDto[] | null;

  @ApiProperty({ enum: PostcardTrackingStatus, enumName: 'PostcardTrackingStatus' })
  trackingStatus: PostcardTrackingStatus;
}
