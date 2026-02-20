// src/stripe/dto/create-top-up.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreateTopUpDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsNumber()
    @Min(1)
    amount: number;
}
