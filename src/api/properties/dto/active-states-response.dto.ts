import {ApiProperty} from "@nestjs/swagger";
import {IsEnum, IsOptional} from "class-validator";
import {State} from "../../../enums/state.enum";

export class ActiveStatesResponseDto {
    @ApiProperty({required: false, enum: State, isArray: true})
    @IsEnum(State)
    @IsOptional()
    state: State[]
}