import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetPostcardDetailDto {
  @ApiProperty({ description: 'Postcard ID (psc_xxx)' })
  @IsString()
  @IsNotEmpty()
  postcardId: string;
}
