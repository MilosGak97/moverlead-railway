import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn, OneToMany, OneToOne, Index,
} from 'typeorm';
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsBoolean, IsEnum, IsNotEmpty, IsNumberString, IsOptional} from 'class-validator';
import {County} from './county.entity';
import {PropertyStatus} from "../enums/property-status.enum";
import {PropertyHomeownerEnrichment} from "./property-homeowner-enrichment.entity";
import {UserPropertyFiltering} from "./user-property-filtering.entity";
import {PropertyAiFiltering} from "./property-ai-filtering.entity";
import {UserExtrasAccess} from "./user-extras-access.entity";
import {Dealmachine} from "./dealmachine.entity";

@Entity('properties')
export class Property {
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id?: string;

    @ApiProperty({required: false})
    @ManyToOne(() => County, (county) => county.properties, {nullable: true})
    @JoinColumn({name: 'countyId'})
    county?: County;

    @Index()
    @ApiProperty({required: false})
    @Column({ type: 'uuid', nullable: true })
    countyId?: string;

    /* FILLED OUT BY OUR SCRAPPER */
    @Index()
    @ApiProperty({required: false})
    @Type(() => String)
    @IsNumberString()
    @Column({nullable: true})
    zpid: string;

    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'initial_scrape', nullable: true})
    initialScrape?: boolean;

    @ApiProperty({required: true, enum: PropertyStatus})
    @IsEnum(PropertyStatus)
    @Column({ name: 'initial_scrape_status', type: 'enum', enum: PropertyStatus, nullable: true })
    initialScrapeStatus?: PropertyStatus;


    @OneToOne(() => PropertyHomeownerEnrichment, (enrichment) => enrichment.property, { cascade: true })
    @JoinColumn()
    homeownerEnrichment?: PropertyHomeownerEnrichment;


    /* GETTING FROM ZILLOW BRIGHT DATA API */
    @ApiProperty({required: false})
    @IsOptional()
    @IsBoolean()
    @Column({name: 'enriched', nullable: true})
    enriched?: boolean;


    // address.street_address
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'street_address', nullable: true})
    streetAddress?: string; // streetAddress

    // address.zipcode
    @ApiProperty({required: false})
    @Type(() => String)
    @IsOptional()
    @Column({nullable: true})
    zipcode?: string;

    //  address.city
    @ApiProperty({required: false})
    @IsOptional()
    @Column({nullable: true})
    city?: string;

    //  address.state
    @ApiProperty({required: false})
    @IsOptional()
    @Column({nullable: true})
    state?: string;

    // bedrooms
    @ApiProperty({required: false})
    @Type(() => Number)
    @IsOptional()
    @Column({type: 'float', nullable: true})
    bedrooms?: number;

    // bathrooms
    @ApiProperty({required: false})
    @Type(() => Number)
    @IsOptional()
    @Column({type: 'float', nullable: true})
    bathrooms?: number;

    // price
    @ApiProperty({required: false})
    @Type(() => String)
    @IsOptional()
    @IsNumberString()
    @Column('numeric',  { precision: 12, scale: 0,  nullable: true })
    price?: number;

    // home_type
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'home_type', nullable: true})
    homeType?: string; // homeType

    // parcel_id
    @ApiProperty({required: false})
    @Type(() => String)
    @Column({name: 'parcel_id', nullable: true})
    parcelId?: string; // parcelId

    // attribution_info.agent_name
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'realtor_name', nullable: true})
    realtorName?: string; // listing_provided_by.name

    // attribution_info.agent_phone_number
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'realtor_phone', nullable: true})
    realtorPhone?: string; // listing_provided_by.name

    // attribution_info.broker_name
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'brokerage_name', nullable: true})
    brokerageName?: string;

    // attribution_info.broker_phone_number
    @ApiProperty({required: false})
    @Type(() => String)
    @IsOptional()
    @Column({name: 'brokerage_phone', nullable: true})
    brokeragePhone?: string;

    // longitude
    @ApiProperty({required: false})
    @IsOptional()
    @Type(() => String)
    @Column({nullable: true})
    longitude?: string;

    // latitude
    @ApiProperty({required: false})
    @IsOptional()
    @Type(() => String)
    @Column({ nullable: true})
    latitude?: string;


    // living_area_value
    @ApiProperty({required: false})
    @Type(() => String)
    @IsOptional()
    @IsNumberString()
    @Column({name: 'living_area_value', nullable: true})
    livingAreaValue?: string;

    // days_on_zillow
    @ApiProperty({required: false})
    @Type(() => Number)
    @IsOptional()
    @Column({name: 'days_on_zillow', nullable: true, type: 'float'})
    daysOnZillow?: number;

    // time on zillow
    @ApiProperty({required: false})
    @Type(() => String)
    @IsOptional()
    @IsNumberString()
    @Column({name: 'time_on_zillow', nullable: true})
    timeOnZillow?: string; //

    // ??
    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'property_type_dimension', nullable: true})
    propertyTypeDimension?: string;

    @ApiProperty({required: false})
    @IsOptional()
    @Column({name: 'county_zillow', nullable: true})
    countyZillow?: string;

    // photo_count
    @ApiProperty({required: false})
    @Type((): NumberConstructor => Number)
    @IsOptional()
    @Column({name: 'photo_count', nullable: true})
    photoCount?: number; // photoCount

    // original_photos.[0-foreach].mixed_sources.jpeg.[0-static].url
    @ApiProperty({required: false})
    @IsOptional()
    @Column({type: 'json', nullable: true})
    photos?: any[];

    /* DEFAULT */
    @ApiProperty({required: false})
    @CreateDateColumn({name: 'created_at'})
    createdAt?: Date;

    @ApiProperty({required: false})
    @UpdateDateColumn({name: 'updated_at'})
    updatedAt?: Date;

    @ApiProperty({required: false})
    @IsOptional()
    @OneToMany(() : typeof Dealmachine => Dealmachine, (dealmachine) => dealmachine.property)
    dealmachine?: Dealmachine[];

    userPropertyFiltering?: UserPropertyFiltering;
    aiFiltering?:   PropertyAiFiltering;
    userExtrasAccessGrant?: UserExtrasAccess;   // ← make sure this line exists
}
