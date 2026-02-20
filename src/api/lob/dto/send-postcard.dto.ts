// send-postcard-job.dto.ts

import { IsEnum, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {PostcardShippingType} from "../../../enums/postcard-shipping-type.enum";

export class ToAddressDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    address_line1: string;

    @IsString()
    address_city: string;

    @IsString()
    address_state: string;

    @IsString()
    address_zip: string;
}

export class SendPostcardJobDto {
    @IsString()
    listingId: string;

    @IsString()
    propertyId: string;

    @IsString()
    userId: string;

    @IsString()
    postcardTemplateId: string;

    @IsEnum(PostcardShippingType)
    shippingType: PostcardShippingType

    @IsString()
    recipientName: string;

    @ValidateNested()
    @Type(() => ToAddressDto)
    toAddress: ToAddressDto;

    @IsString()
    frontUrl: string;

    @IsString()
    backUrl: string;

    @IsString()
    size: string;
}
