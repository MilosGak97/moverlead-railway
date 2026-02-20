import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsString} from "class-validator";

export class ResetPasswordDto{
    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    password: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    repeatPassword: string;
}