import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCheckoutSessionResponseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  checkoutUrl: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  checkoutId: string;
}
