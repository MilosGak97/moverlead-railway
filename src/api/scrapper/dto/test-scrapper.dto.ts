import {ApiProperty} from "@nestjs/swagger";
import {IsBoolean} from "class-validator";

export class TestScrapperDto{
    @ApiProperty()
    @IsBoolean()
    initialScrapper: boolean;
}