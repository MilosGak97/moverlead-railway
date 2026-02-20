import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ZillowDataDto{
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    countyId: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    zillowUrl: string;

}