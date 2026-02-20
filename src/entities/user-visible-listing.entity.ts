import {CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";
import {User} from "./user.entity";
import {PropertyListing} from "./property-listing.entity";

@Index('idx_uvl_pl', ['propertyListing'])
@Entity('user-visible-listings')
export class UserVisibleListing{
    @ApiProperty({required: true})
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ApiProperty({required: true})
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({name: 'user_id'})
    user: User;

    @ApiProperty({required: true})
    @Index("idx_uvl_pl", ["propertyListing"])   // ← index on propertyListing
    @ManyToOne(() => PropertyListing, { onDelete: 'CASCADE' })
    @JoinColumn({name: 'property_listing_id'})
    propertyListing: PropertyListing;

    @ApiProperty({required: true})
    @CreateDateColumn({name: 'created_at'})
    createdAt: Date;
}