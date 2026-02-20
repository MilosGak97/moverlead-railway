import { ApiProperty } from '@nestjs/swagger';

export class GetCompanyResponseDto {
  @ApiProperty()
  companyName: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  address2: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  zip: string;

  @ApiProperty()
  website: string;

  @ApiProperty()
  phoneNumber: string;
}
