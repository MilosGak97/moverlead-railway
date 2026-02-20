import {Body, Controller, Get, Post, UseGuards} from '@nestjs/common';
import {UserTokenService} from "./user-token.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import { ApiTags } from "@nestjs/swagger";
import {UserId} from "../auth/user-id.decorator";

@ApiTags('user-token')
@UseGuards(JwtAuthGuard)
@Controller('token')
export class UserTokenController {
    constructor(
        private readonly userTokenService: UserTokenService,
    ) {
    }

    @Get('balance')
    async getBalance(@UserId() userId: string): Promise<string> {
        return await this.userTokenService.getBalance(userId)
    }

}
