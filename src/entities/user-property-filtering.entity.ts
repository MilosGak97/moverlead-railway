import {Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {IsEnum, IsUUID} from "class-validator";
import {User} from "./user.entity";
import {Property} from "./property.entity";
import {FilteredStatus} from "../enums/filtered-status.enum";

@Entity('user-property-filterings')
export class UserPropertyFiltering{
    @ApiProperty({required: true})
    @IsUUID()
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({required: true})
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ApiProperty({required: true})
    @ManyToOne(() => Property, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'property_id' })
    property: Property;

    @ApiProperty({required: true, enum: FilteredStatus})
    @IsEnum(FilteredStatus)
    @Column({name: 'filtered_status', type: 'enum', enum: FilteredStatus})
    filteredStatus: FilteredStatus;

    @ApiProperty({required: true})
    @CreateDateColumn({name: 'filtered_at'})
    filteredAt: Date;
}