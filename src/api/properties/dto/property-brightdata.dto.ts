import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class PropertyBrightdata{
    
        @ApiProperty({required: false})
        @IsOptional()
        zpid: string;
        
        @ApiProperty({required: false})
        @IsOptional()
        @IsString()
        rawHomeStatusCd: string; // ForSale | ComingSoon | Pending
    
        @ApiProperty({required: false})
        @IsOptional()
        @IsString()
        detailUrl: string; ///homedetails/3605-Lincoln-Ter-North-Bergen-NJ-07047/447523793_zpid/
        
        @ApiProperty({required: false})
        @IsOptional()
        price: string //$674,999
        
        @ApiProperty({required: false})
        @IsOptional()
        address: string //5 Tribeca Ave UNIT 509, Jersey City, NJ 07305
    
        @ApiProperty({required: false})
        @IsOptional()
        @Type(() => Number)
        beds: number; //2
        
        @ApiProperty({required: false})
        @IsOptional()
        @Type(() => Number)
        baths: number; //2
        
        @ApiProperty({required: false})
        @IsOptional()
        streetAddress: string; // hdpData.homeInfo.streetAddress
        
        @ApiProperty({required: false})
        @IsOptional()
        zipcode: string // // hdpData.homeInfo.zipcode
        
        @ApiProperty({required: false})
        @IsOptional()
        city: string // // hdpData.homeInfo.city
        
        @ApiProperty({required: false})
        @IsOptional()
        state: string // // hdpData.homeInfo.state
        
        @ApiProperty({required: false})
        @IsOptional()
        latitude: string // // hdpData.homeInfo.latitude
    
        @ApiProperty({required: false})
        @IsOptional()
        longitude: string // // hdpData.homeInfo.longitude
    
        @ApiProperty({required: false})
        @IsOptional()
        homeType: string // // hdpData.homeInfo.homeType
}