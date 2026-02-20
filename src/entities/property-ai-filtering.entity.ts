import {Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {Property} from "./property.entity";
import {FilteredStatus} from "../enums/filtered-status.enum";
import {IsEnum} from "class-validator";
import {AiFilteringJobStatus} from "../enums/ai-filtering-job-status.enum";

@Entity('property-ai-filtering')
export class PropertyAiFiltering{
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @OneToOne(() => Property, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'property_id' })
    property: Property;

    @ApiProperty({ required: true, enum: AiFilteringJobStatus })
    @IsEnum(AiFilteringJobStatus)
    @Column({
        name: 'job_status',
        type: 'enum',
        enum: AiFilteringJobStatus,
        default: AiFilteringJobStatus.PENDING,
    })
    jobStatus: AiFilteringJobStatus;


    @ApiProperty({required: true, enum: FilteredStatus})
    @IsEnum(FilteredStatus)
    @Column({name: 'filtered_status', type: 'enum', enum: FilteredStatus, nullable:true})
    filteredStatus?: FilteredStatus;

    @ApiProperty({required: false})
    @Column({name: 'raw_response', nullable: true})
    rawResponse?: string;
}