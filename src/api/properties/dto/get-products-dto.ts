import { ApiProperty } from '@nestjs/swagger';
import { State } from '../../../enums/state.enum';
import { IsEnum } from 'class-validator';

export class GetProductsDto {
  @ApiProperty({ enum: State })
  @IsEnum(State)
  state: State;
}
