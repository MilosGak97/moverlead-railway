import {DataSource, Repository} from "typeorm";
import {UserToken} from "../entities/user-token.entity";
import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import { User } from '../entities/user.entity';

@Injectable()
export class UserTokenRepository extends Repository<UserToken>{
    constructor(
        private readonly dataSource: DataSource
    ){
        super(UserToken, dataSource.createEntityManager())
    }

    /** Ensure a UserToken row exists for this user */
    async getOrCreate(userId: string): Promise<UserToken> {
        let token = await this.findOne({ where: { user: { id: userId } as User } });
        if (!token) {
            token = this.create({ user: { id: userId } as User, balance: '0' });
            token = await this.save(token);
        }
        return token;
    }

    /** Return the current balance */
    async getBalance(userId: string): Promise<string> {
        const token = await this.getOrCreate(userId);
        return token.balance;
    }

    /** Check if user has at least `amount` tokens */
    async checkBalance(userId: string, amount: number): Promise<boolean> {
        if (amount <= 0) return true;
        const balance = await this.getBalance(userId);
        return Number(balance) >= amount;
    }

    /**
     * Deduct `amount` from user’s tokens atomically,
     * using a single UPDATE ... WHERE balance >= amount
     */
    async deduct(userId: string, amount: number): Promise<void> {
        if (amount <= 0) return;
        const result = await this.createQueryBuilder()
            .update(UserToken)
            .set({ balance: () => `balance - ${amount}` })
            .where('user_id = :userId', { userId })
            .andWhere('balance >= :amount', { amount })
            .execute();

        if (result.affected === 0) {
            // Determine reason: missing record or insufficient funds
            const exists = await this.findOne({ where: { user: { id: userId } as User } });
            if (!exists) {
                throw new NotFoundException('Token record not found');
            }
            throw new BadRequestException('Insufficient tokens');
        }
    }

    /**
     * Credit tokens to user (create if needed) using atomic operation
     */
    async credit(userId: string, amount: number): Promise<void> {
        if (amount <= 0) return;
        // Ensure record exists
        const token = await this.getOrCreate(userId);
        // Use repository.increment for simplicity
        await this.increment({ id: token.id }, 'balance', amount);
    }

}