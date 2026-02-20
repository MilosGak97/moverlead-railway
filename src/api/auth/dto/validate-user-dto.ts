import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateUserDto {
  @ApiProperty({ required: true })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  @Type(() => String)
  email: string;

  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  @Type(() => String)
  password: string;
}
