import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsNotEmpty} from "class-validator";

export class ForgotPasswordRequestDto{
    @ApiProperty({required:true})
    @IsNotEmpty()
    @IsEmail()
    email: string;
}