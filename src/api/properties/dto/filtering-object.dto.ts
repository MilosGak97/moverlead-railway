import {ApiProperty} from "@nestjs/swagger";
import {IsArray, IsNotEmpty, IsString} from "class-validator";

export class FilteringObjectDto{
    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    id: string;

    @ApiProperty()
    @IsArray()
    photos: string[];
}