import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  firstName: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  lastName: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsEmail()
  @Type(() => String)
  email: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  phoneNumber: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  companyName: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  password: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type(() => String)
  repeatPassword: string;
}
