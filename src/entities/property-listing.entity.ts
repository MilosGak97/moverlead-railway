import {
    Column,
    CreateDateColumn,
    Entity, Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn
} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {Property} from "./property.entity";
import {PropertyStatus} from "../enums/property-status.enum";
import {UserPropertyFiltering} from "./user-property-filtering.entity";
import {PropertyAiFiltering} from "./property-ai-filtering.entity";

@Entity('property-listings')
@Index('idx_pl_prop_status_unique', ['property', 'status'])
export class PropertyListing {
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({ required: true })
    @ManyToOne(() => Property, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'property_id' })
    property: Property;

    @ApiProperty({ required: true, enum: PropertyStatus })
    @Column({ name: 'status', type: 'enum', enum: PropertyStatus })
    status: PropertyStatus;


    @ApiProperty({ required: true })
    @Column({ name: 'status_date', type: 'timestamp', nullable: true })
    statusDate?: Date;

    /* DEFAULT */
    @ApiProperty({required: true})
    @CreateDateColumn({name: 'created_at'})
    createdAt?: Date;

    @ApiProperty({required: true})
    @UpdateDateColumn({name: 'updated_at'})
    updatedAt?: Date;

}