import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class RunBrightDataInitiallyDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Type((): StringConstructor => String)
  subscriptionId: string;
}
