import {Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "./user.entity";
import {Property} from "./property.entity";
import {IsEnum, IsOptional} from "class-validator";
import {UserExtrasAccessType} from "../enums/user-extras-access-type.enum";

@Entity('user-extras-access')
export class UserExtrasAccess{
    @ApiProperty()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty()
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ApiProperty()
    @ManyToOne(() => Property, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'property_id' })
    property: Property;

    @ApiProperty({ required: true, enum: UserExtrasAccessType })
    @IsEnum(UserExtrasAccessType)
    @Column({ name: 'access_type', type: 'varchar' })
    accessType: UserExtrasAccessType

    @ApiProperty()
    @CreateDateColumn({ name: 'granted_at' })
    grantedAt: Date;

// user-extras-access.entity.ts
    @Column({ name: 'token_used', type: 'numeric', precision: 12, scale: 2, default: 0 })
    tokenUsed: string; // or number with transformer

}