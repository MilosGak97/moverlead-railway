import {Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards} from '@nestjs/common';
import {LobService} from "./lob.service";
import {ApiOkResponse, ApiOperation, ApiProperty, ApiTags} from "@nestjs/swagger";
import { Request } from 'express';
import {GetPostcardTemplateDto} from "./dto/get-postcard-template.dto";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {PostcardTemplate} from "../../entities/postcard-template.entity";
import {CreatePostcardTemplateDto} from "./dto/create-postcard-template.dto";
import {SendPostcardsDto} from "./dto/send-postcards.dto";
import {MessageResponseDto} from "../../dto/message-response.dto";
import {SendPostcardsResponseDto} from "./dto/send-postcards-response.dto";
import {GetPostcardsOverviewDto} from "./dto/get-postcards-overview.dto";
import {GetPostcardsPaginatedDto} from "./dto/get-postcards-paginated.dto";
import {PostcardsPaginatedResponseDto} from "./dto/postcards-paginated-response.dto";
import {PostcardsOverviewResponseDto} from "./dto/postcards-overview-response.dto";
import {GetPostcardDetailDto} from "./dto/get-postcard-detail.dto";
import {PostcardDetailResponseDto} from "./dto/postcard-detail.response.dto";

@UseGuards(JwtAuthGuard)
@ApiTags('lob')
@Controller('lob')
export class LobController {
    constructor( private readonly lobService: LobService) {}

    @ApiOperation({summary: 'Create a new postcard template'})
    @Post('postcard-template')
    async createPostcardTemplate(
        @Body() body: CreatePostcardTemplateDto,
        @Req() req: Request & { userId?: string },
    ) {
        const userId = req.userId;
        return await this.lobService.createPostcardTemplate(body, userId);
    }

    @ApiOperation({summary: "Fetch all postcards templates"})
    @ApiOkResponse({type: [PostcardTemplate] })
    @Get('postcard-template')
    async getPostcardTemplate(
        @Query() query: GetPostcardTemplateDto,
        @Req() req: Request & { userId?: string }
    ): Promise<PostcardTemplate[]>{
        const userId = req.userId;
        console.log(userId);
        return this.lobService.fetchPostcardTemplate(query.postCardSize, userId);
    }

    @ApiOperation({summary: 'Delete a postcard template'})
    @ApiOkResponse({ type: MessageResponseDto })
    @Delete('postcard-template/:id')
    async deletePostcardTemplate(
        @Param('id') id: string,
        @Req() req: Request & { userId?: string },
    ): Promise<MessageResponseDto> {
        const userId = req.userId;
        return await this.lobService.deletePostcardTemplate(id, userId);
    }

    @ApiOperation({ summary: 'Send postcards using template and listing addresses' })
    //@ApiOkResponse({type: SendPostcardsResponseDto})
    @Post('postcards/send')
    async sendPostcards(
        @Body() body: SendPostcardsDto,
        @Req() req: Request & { userId?: string },
    ) {
        const userId = req.userId;
        return await this.lobService.sendPostcards(body, userId);
    }

    @ApiOperation({ summary: 'Paginated postcard list for current user' })
    @ApiOkResponse({ type: PostcardsPaginatedResponseDto })
    @Get('postcards')
    async getPostcardsPaginated(
        @Query() query: GetPostcardsPaginatedDto,
        @Req() req: Request & { userId?: string },
    ): Promise<PostcardsPaginatedResponseDto> {
        const userId = req.userId;
        return await this.lobService.listUserPostcardsPaginated(query, userId);
    }

    @ApiOperation({ summary: 'Postcard overview (total + counts per day) for current user' })
    @ApiOkResponse({ type: PostcardsOverviewResponseDto })
    @Get('postcards/overview')
    async getPostcardsOverview(
        @Query() query: GetPostcardsOverviewDto,
        @Req() req: Request & { userId?: string },
    ) {
        const userId = req.userId;
        return await this.lobService.listUserPostcards(query, userId);
    }

    @ApiOperation({ summary: 'Get postcard detail for current user' })
    @ApiOkResponse({ type: PostcardDetailResponseDto })
    @Get('postcards/:postcardId')
    async getPostcardDetail(
        @Req() req: Request & { userId?: string },
        @Param('postcardId') postcardId: string,
    ): Promise<PostcardDetailResponseDto> {
        const userId = req.userId;
        return await this.lobService.getPostcardDetail(postcardId, userId);
    }
}
