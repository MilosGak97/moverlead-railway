import {ApiProperty} from "@nestjs/swagger";
import {ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsUUID} from "class-validator";
import {PostcardShippingType} from "../../../enums/postcard-shipping-type.enum";

export class SendPostcardsDto {
    @ApiProperty({required: true})
    @IsNotEmpty()
    @IsArray()
    @ArrayNotEmpty()
    @IsUUID('all', {each: true})
    listingIds: string[];

    @ApiProperty({required: true})
    @IsUUID()
    postcardTemplateId: string;

    @ApiProperty({enum: PostcardShippingType, required: true})
    @IsNotEmpty()
    @IsEnum(PostcardShippingType)
    postcardShippingType: PostcardShippingType;
}