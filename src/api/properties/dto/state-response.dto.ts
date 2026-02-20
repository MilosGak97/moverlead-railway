import { ApiProperty } from '@nestjs/swagger';

export class StateResponseDto {
  @ApiProperty()
  abbreviation: string;

  @ApiProperty()
  name: string;
}
