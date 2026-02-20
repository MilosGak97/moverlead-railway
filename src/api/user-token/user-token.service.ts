import { Injectable } from '@nestjs/common';
import {UserTokenRepository} from "../../repositories/user-token.repository";
import {UserId} from "../auth/user-id.decorator";

@Injectable()
export class UserTokenService {
    constructor(
        private readonly userTokenRepository: UserTokenRepository
    ) {
    }

    async getBalance(userId: string
    ):Promise<string>{
        return await this.userTokenRepository.getBalance(userId)
    }

    async checkBalance(userId: string, amount: number): Promise<boolean> {
        return await this.userTokenRepository.checkBalance(userId, amount)
    }

    async deduct(userId: string, amount: number): Promise<void> {
        return await this.userTokenRepository.deduct(userId, amount)
    }

    async credit(userId: string, amount: number): Promise<void> {
        return await this.userTokenRepository.credit(userId, amount)
    }

}
