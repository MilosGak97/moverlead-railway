import {DataSource, Repository} from "typeorm";
import {UserExtrasAccess} from "../entities/user-extras-access.entity";
import {Injectable} from "@nestjs/common";

@Injectable()
export class UserExtrasAccessRepository extends Repository<UserExtrasAccess>{
    constructor(private readonly dataSource: DataSource) {
        super(UserExtrasAccess, dataSource.createEntityManager());
    }




}