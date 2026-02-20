import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MessageResponseDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  message: string;
}
