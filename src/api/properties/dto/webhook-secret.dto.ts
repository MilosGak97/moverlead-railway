import { ApiProperty } from '@nestjs/swagger';
export class WebhookDto {
  @ApiProperty()
  webhookSecret: string;

  @ApiProperty()
  daysOnZillow: string;
}
