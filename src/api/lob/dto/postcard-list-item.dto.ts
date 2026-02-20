import { ApiProperty } from '@nestjs/swagger';
import { PostcardShippingType } from '../../../enums/postcard-shipping-type.enum';
import { PostcardSize } from '@lob/lob-typescript-sdk';

export class PostcardListItemDto {
  @ApiProperty({ example: 'psc_abcd1234' })
  id: string;

  @ApiProperty({ example: 'https://lob-assets.com/postcards/psc_abcd_thumb_small_1.png', nullable: true })
  thumbnail?: string | null;

  @ApiProperty({ example: 'John Doe' })
  recipient: string;

  @ApiProperty({ example: '2025-09-01T00:00:00.000Z' })
  sendDate: string;

  @ApiProperty({ enum: PostcardSize, example: PostcardSize._6x11 })
  size?: PostcardSize;

  @ApiProperty({ enum: PostcardShippingType, example: PostcardShippingType.USPS_FIRST_CLASS })
  mailClass?: PostcardShippingType;

  @ApiProperty({ example: 'Postcard sent for the Labor Day weekend campaign.', nullable: true })
  description?: string | null;
}
