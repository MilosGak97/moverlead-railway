import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn
} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {IsBoolean, IsNotEmpty, IsOptional, IsString} from "class-validator";
import {Property} from "./property.entity";

@Entity('dealmachine')
export class Dealmachine {
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Column({name: 'first_name'})
    firstName: string;

    @ApiProperty({required: true})
    @IsString()
    @IsNotEmpty()
    @Column({name: 'last_name'})
    lastName: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'phone_number_1', nullable: true})
    phoneNumber1: string;


    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'phone_number_2', nullable: true})
    phoneNumber2: string;


    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'phone_number_3', nullable: true})
    phoneNumber3: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'email_1', nullable: true})
    email1: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Column({name: 'email_1_valid', nullable: true})
    email1Valid: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'email_2', nullable: true})
    email2: string;


    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Column({name: 'email_2_valid', nullable: true})
    email2Valid: string;

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'email_3', nullable: true})
    email3: string;

    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Column({name: 'email_3_valid', nullable: true})
    email3Valid: string;


    @ApiProperty({required: false})
    @IsOptional()
    @IsString()
    @Column({name: 'listing_status', nullable: true})
    listingStatus: string;

    @ApiProperty({required: true})
    @ManyToOne(() :typeof Property => Property, (property: Property): Dealmachine[] => property.dealmachine, { eager: true })
    property: Property;


    @ApiProperty({required: true})
    @CreateDateColumn()
    createdAt: Date;

    @ApiProperty({required: true})
    @UpdateDateColumn()
    updatedAt: Date;
}