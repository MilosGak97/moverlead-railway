import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DealmachineDownloadDto {
    @ApiProperty({
        description: 'Direct HTTPS download link from the DealMachine email',
        example: 'https://files.dealmachine.com/exports/abc123.csv?sig=...',
    })
    @IsString()
    @IsUrl({ require_protocol: true })
    url!: string;
}