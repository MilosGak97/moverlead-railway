import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsNotEmpty} from "class-validator";

export class SendVerificationEmailDto{
    @ApiProperty({required:true})
    @IsEmail()
    @IsNotEmpty()
    email: string
}