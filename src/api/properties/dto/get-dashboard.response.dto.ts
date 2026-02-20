import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetDashboardResponseDto {
  @ApiProperty()
  @Type(() => Number)
  lastMonthCount: number;

  @ApiProperty()
  @Type(() => Number)
  thisMonthCount: number;

  @ApiProperty()
  @Type(() => Number)
  todayCount: number;
}
