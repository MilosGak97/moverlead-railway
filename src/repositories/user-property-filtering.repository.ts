import {UserPropertyFiltering} from "../entities/user-property-filtering.entity";
import {DataSource, Repository} from "typeorm";
import {Injectable} from "@nestjs/common";

@Injectable()
export class UserPropertyFilteringRepository extends Repository<UserPropertyFiltering>{
    constructor(
        private readonly dataSource: DataSource
    ) {
        super(UserPropertyFiltering, dataSource.createEntityManager());
    }



}