import { ApiProperty } from '@nestjs/swagger';

class PostcardsOverviewDayDto {
  @ApiProperty({ example: '2025-08-01' })
  date: string;

  @ApiProperty({ example: 12 })
  count: number;
}

export class PostcardsOverviewResponseDto {
  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ type: [PostcardsOverviewDayDto] })
  days: PostcardsOverviewDayDto[];
}
