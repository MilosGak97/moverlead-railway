import {ApiExtraModels, ApiProperty} from "@nestjs/swagger";
import {IsArray, IsNotEmpty, IsNumber} from "class-validator";
import {GetListingObjectDto} from "./get-listing.object.dto";
import {Type} from "class-transformer";

@ApiExtraModels(GetListingObjectDto)
export class GetListingsResponseDto {
    @ApiProperty({type: [GetListingObjectDto]})
    @IsNotEmpty()
    @IsArray()
    result: GetListingObjectDto[];

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor=> Number)
    totalRecords: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor=> Number)
    currentPage: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor=> Number)
    totalPages: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor=> Number)
    limit: number;

    @ApiProperty()
    @IsNumber()
    @Type((): NumberConstructor=> Number)
    offset: number;
}