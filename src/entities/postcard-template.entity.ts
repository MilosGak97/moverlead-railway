import {ApiProperty} from "@nestjs/swagger";
import {Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {IsEnum, IsNotEmpty, IsString} from "class-validator";
import {PostCardSize} from "../enums/postcard-size.enum";
import {User} from "./user.entity";

@Entity('postcard-template')
export class PostcardTemplate{
    @ApiProperty({required:true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    @Column({nullable: false})
    name: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    @Column({nullable: false})
    frontId: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    @Column({nullable: false})
    frontUrl: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    @Column({nullable: false})
    backId: string;

    @ApiProperty({required:true})
    @IsString()
    @IsNotEmpty()
    @Column({nullable: false})
    backUrl: string;

    @ApiProperty({required:true, enum: PostCardSize})
    @IsEnum(PostCardSize)
    @Column({nullable: false})
    size: PostCardSize;

    @ApiProperty({ type: () => User })
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}