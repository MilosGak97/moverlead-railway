import {ApiProperty} from "@nestjs/swagger";
import {IsArray, IsNotEmpty} from "class-validator";

export class ListingsExportDto {
    @ApiProperty({isArray: true, required: true, type: String, })
    @IsNotEmpty()
    @IsArray()
    ids: string[];
}