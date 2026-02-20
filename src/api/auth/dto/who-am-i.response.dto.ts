import { ApiProperty } from '@nestjs/swagger';
import {IsEnum, IsString, IsUUID} from "class-validator";
import {UserStatus} from "../../../enums/user-status.enum";

export class WhoAmIResponse {
  @ApiProperty({ required: true })
  @IsString()
  email: string;

  @ApiProperty({ required: true })
  @IsString()
  companyName: string;

  @ApiProperty()
  @IsString()
  logoUrl: string;

  @ApiProperty({required: true, enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  iat: string;

  @ApiProperty()
  exp: string;
}
