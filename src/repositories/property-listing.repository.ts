import {PropertyListing} from "../entities/property-listing.entity";
import {DataSource, Repository} from "typeorm";
import {Injectable} from "@nestjs/common";

@Injectable()
export class PropertyListingRepository extends Repository<PropertyListing>{
    constructor(
        private readonly dataSource: DataSource,
    ) {
        super(PropertyListing, dataSource.createEntityManager());
    }


}