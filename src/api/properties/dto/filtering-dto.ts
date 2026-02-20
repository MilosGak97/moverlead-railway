import {ApiProperty} from "@nestjs/swagger";
import {IsNumber, IsOptional} from "class-validator";
import {Type} from "class-transformer";

export class FilteringDto{
    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    offset: number;
}
