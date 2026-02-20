import {ApiProperty} from "@nestjs/swagger";
import {IsNotEmpty, IsNumber, IsString, IsUUID} from "class-validator";
import {Type} from "class-transformer";

export class GetProductsResponseDto{
    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsUUID()
    id: string;

    @ApiProperty({required: true})
    @IsUUID()
    @IsNotEmpty()
    priceId: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    state: string;

    @ApiProperty({required: true})
    @IsNumber()
    @Type(() => Number)
    amount: number;
}