import {ApiPropertyOptional} from "@nestjs/swagger";
import {ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional} from "class-validator";
import {Transform} from "class-transformer";
import {PostCardSize} from "../../../enums/postcard-size.enum";

export class GetPostcardTemplateDto {
    @ApiPropertyOptional({
        enum: Object.values(PostCardSize).map((size) => size.toLowerCase()),
        isArray: true,
        description: 'Optional list of postcard sizes to filter; omit to fetch all sizes',
    })
    @Transform(({value}) => normalizePostcardSizes(value))
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(3)
    @IsEnum(PostCardSize, {each: true})
    postCardSize?: PostCardSize[];
}

function normalizePostcardSizes(value: unknown): PostCardSize[] | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const values = Array.isArray(value) ? value : [value];
    return values.map((val) =>
        typeof val === 'string' ? (val.toLowerCase() as PostCardSize) : (val as PostCardSize),
    );
}
