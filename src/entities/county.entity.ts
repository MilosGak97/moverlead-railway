import {
  Column,
  CreateDateColumn,
  Entity, Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { State } from '../enums/state.enum';
import { Type } from 'class-transformer';
import { Property } from './property.entity';

@Entity('counties')
export class County {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ required: true })
  @IsString()
  @IsNotEmpty()
  @Column()
  name: string;

  @ApiProperty({ required: true, enum: State })
  @IsEnum(State)
  @IsNotEmpty()
  @Column()
  state: State;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @Column({ name: 'product_id', nullable: true })
  productId: string; // prod_RiK83a7Vlhb8sf

  @Index()
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @Column({ name: 'price_id', nullable: true })
  priceId: string; //price_1QotUeP0ONo4d0belYeNEfym

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Type((): NumberConstructor => Number)
  @Column({ name: 'amount', nullable: true })
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @OneToMany(() => Property, (properties) => properties.county, {
    nullable: true,
    lazy: true,
  })
  properties?: Property[];

  @ApiProperty({ required: false, isArray: true })
  @IsArray()
  @IsOptional()
  @Column({ name: 'zip_codes', type: 'simple-array', nullable: true })
  zipCodes?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  @Column({ name: 'scrapping_end_date', nullable: true })
  scrappingEndDate: string;

  @ApiProperty({ required: false, isArray: true })
  @IsArray()
  @IsOptional()
  @Column({ name: 'zillow_links', type: 'simple-array', nullable: true })
  zillowLinks?: string[];

    @ApiProperty({required: false})
    @IsString()
    @IsOptional()
    @Column({name: 'zillow_link', nullable: true})
    zillowLink?: string;


    @ApiProperty({
        required: false,
        isArray: true,

    })
    @IsOptional()
    @Column({ name: 'zillow_define_input', type: 'json', nullable: true }) // or type: 'simple-json' for MySQL/SQLite
    zillowDefineInput?: { minPrice: number; maxPrice: number; resultNumber: number }[];

    @ApiProperty()
    @CreateDateColumn()
    createdAt: Date;

    @ApiProperty()
    @UpdateDateColumn()
    updatedAt: Date;
}
