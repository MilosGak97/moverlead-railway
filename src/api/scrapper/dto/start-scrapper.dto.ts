import {ApiProperty} from "@nestjs/swagger";
import {IsBoolean, IsNotEmpty, IsOptional} from "class-validator";

export class StartScrapperDto{
    @ApiProperty()
    @IsNotEmpty()
    initialScrapper: boolean;

    @ApiProperty({
        required: false,
        description: 'If true, run scrapper for all counties that have Zillow data defined',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    useZillowCounties?: boolean;
}
