// src/stripe/entities/top-up.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    JoinColumn,
    Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {User} from "./user.entity";
import {TopUpTokenStatus} from "../enums/top-up-token-status.enum";
import {IsEnum} from "class-validator";


@Entity('top-up-token')
@Unique(['sessionId'])
export class TopUpToken {
    @ApiProperty()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({ type: () => String })
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ApiProperty()
    @Column('integer', { name: 'token_number' })
    tokenNumber: number;

    @ApiProperty({ enum: TopUpTokenStatus })
    @IsEnum(TopUpTokenStatus)
    @Column({ type: 'varchar', length: 20, })
    status: TopUpTokenStatus;

    @ApiProperty()
    @Column({ type: 'varchar', length: 255, name: 'session_id' })
    sessionId: string;

    @ApiProperty()
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}