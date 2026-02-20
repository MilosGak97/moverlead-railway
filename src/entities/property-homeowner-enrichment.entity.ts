import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn, OneToOne,
} from 'typeorm';
import { Property } from './property.entity';
import { ApiProperty } from '@nestjs/swagger';
import {IsBoolean, IsOptional, IsString} from 'class-validator';

@Entity('property-homeowner-enrichment')
export class PropertyHomeownerEnrichment {
    @ApiProperty({ required: true })
    @PrimaryGeneratedColumn('uuid')
    id: string;


    @OneToOne(() => Property, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'property_id' })
    property: Property;


    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Column({ name: 'owner_first_name', nullable: true })
    ownerFirstName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Column({ name: 'owner_last_name', nullable: true })
    ownerLastName?: string;

    @ApiProperty({ required: false, description: 'Is Commercial' })
    @IsOptional()
    @IsBoolean()
    @Column({ name: 'is_commercial', nullable: true })
    isCommercial?: boolean;

    @ApiProperty({ required: false, description: 'Raw JSON data from enrichment provider' })
    @IsOptional()
    @Column({ name: 'home_owner_raw_data', type: 'json', nullable: true })
    homeOwnerRawData?: any;

    @ApiProperty({ required: false })
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
