import {ApiProperty} from "@nestjs/swagger";

export class AiFilteringDto{
    @ApiProperty({required:true})
    propertyId: string;

    @ApiProperty({required:true})
    photos: string[];

}