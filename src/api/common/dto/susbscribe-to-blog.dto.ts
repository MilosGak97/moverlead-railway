import {IsEmail, IsNotEmpty} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class SubscribeToBlogDto{
    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsEmail()
    email: string;
}