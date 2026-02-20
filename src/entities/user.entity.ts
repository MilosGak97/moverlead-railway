import {
    Column,
    CreateDateColumn,
    Entity,
    ManyToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    JoinTable, OneToMany,
} from 'typeorm';
import {ApiProperty} from '@nestjs/swagger';
import {
    IsBoolean,
    IsEmail, IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import {Type} from 'class-transformer';
import {Property} from './property.entity';
import {UserStatus} from "../enums/user-status.enum";
import {PostcardTemplate} from "./postcard-template.entity";

@Entity('users')
export class User {
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Type(() => String)
    @Column({name: 'first_name'})
    firstName: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Type(() => String)
    @Column({name: 'last_name'})
    lastName: string;

    @ApiProperty({required: false, enum: UserStatus})
    @IsEnum(UserStatus)
    @IsOptional()
    @Column({nullable: true})
    status?: UserStatus

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'stripe_id', nullable: true})
    stripeId: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Type(() => String)
    @Column({name: 'company_name'})
    companyName: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Column({name: 'logo_url', nullable: true})
    logoUrl: string;

    @ApiProperty({required: true})
    @IsEmail()
    @IsNotEmpty()
    @Type(() => String)
    @Column()
    email: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Type(() => String)
    @Column()
    password: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    address: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    address2: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    city: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    state: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    zip: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    website: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Type(() => String)
    @Column({name: 'phone_number', nullable: true})
    phoneNumber: string;

    @ApiProperty({required: false})
    @CreateDateColumn()
    createdAt: Date;

    @ApiProperty({required: false})
    @UpdateDateColumn()
    updatedAt: Date;
}
