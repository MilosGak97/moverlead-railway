import {ApiProperty} from "@nestjs/swagger";

export class UserSubscriptionsDto{
    @ApiProperty()
    countyId: string;

    @ApiProperty()
    fromDate: string;

    @ApiProperty()
    toDate: string;
}