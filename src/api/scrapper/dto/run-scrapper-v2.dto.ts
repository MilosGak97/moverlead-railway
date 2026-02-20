import {ApiProperty} from "@nestjs/swagger";

export class RunScrapperV2Dto {
    @ApiProperty({required: true})
    initialScrapper: boolean;

}