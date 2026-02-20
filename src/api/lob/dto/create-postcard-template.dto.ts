import {ApiProperty} from "@nestjs/swagger";
import {IsEnum, IsNotEmpty, IsString} from "class-validator";
import {Transform} from "class-transformer";
import {PostCardSize} from "../../../enums/postcard-size.enum";

export class CreatePostcardTemplateDto{
    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    frontId: string;


    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    frontUrl: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    backId: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    backUrl: string;

    @ApiProperty({
        required:true,
        enum: Object.values(PostCardSize).map((size) => size.toLowerCase()),
    })
    @Transform(({value}) => typeof value === 'string' ? value.toLowerCase() : value)
    @IsEnum(PostCardSize)
    size: PostCardSize;
}
