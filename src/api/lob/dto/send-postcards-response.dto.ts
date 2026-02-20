import {ApiProperty} from "@nestjs/swagger";
import {IsNumber} from "class-validator";

export class SendPostcardsResponseDto{
    @ApiProperty()
    @IsNumber()
    sent: number;

    @ApiProperty()
    @IsNumber()
    details: any[];
}