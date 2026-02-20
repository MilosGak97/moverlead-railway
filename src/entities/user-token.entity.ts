// src/entities/user-token.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
    Unique, Check,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user-tokens')
@Unique(['user'])
@Check(`balance_nonnegative`, `"balance" >= 0`)
export class UserToken {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    /*
    @Column({ type: 'integer', default: 0 })
    balance: number;
    */

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    balance: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
