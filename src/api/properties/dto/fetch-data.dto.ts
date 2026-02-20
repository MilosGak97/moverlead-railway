import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsString } from "class-validator";

export class FetchDataDto{
    @ApiProperty()
    @IsNotEmpty()
    @IsBoolean()
    initialScrapper: boolean;
}