import { ApiProperty } from '@nestjs/swagger';

export class UploadResultsDto {
  @ApiProperty()
  results: any;

  @ApiProperty()
  county_id: string;

  @ApiProperty()
  key: string;
}
