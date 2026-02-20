import {Module} from '@nestjs/common';
import {UserTokenService} from './user-token.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {UserToken} from "../../entities/user-token.entity";
import {UserTokenRepository} from "../../repositories/user-token.repository";
import {UserTokenController} from "./user-token.controller";
import {TopUpTokenRepository} from "../../repositories/top-up-token.repository";
import {TopUpToken} from "../../entities/top-up-token.entity";

@Module({
    imports: [TypeOrmModule.forFeature([UserToken, TopUpToken])],
    providers: [UserTokenService, UserTokenRepository, TopUpTokenRepository],
    exports: [UserTokenService],
    controllers: [UserTokenController],
})
export class UserTokenModule {
}
