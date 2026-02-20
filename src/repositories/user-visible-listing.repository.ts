import {DataSource, Repository} from "typeorm";
import {UserVisibleListing} from "../entities/user-visible-listing.entity";
import {Injectable} from "@nestjs/common";

@Injectable()
export class UserVisibleListingRepository extends Repository<UserVisibleListing>{
    constructor(private readonly dataSource: DataSource) {
        super(UserVisibleListing, dataSource.createEntityManager());
    }
}