import {Injectable} from "@nestjs/common";
import {DataSource, Repository} from "typeorm";
import {UserSubscription} from "../entities/user-subscription.entity";

@Injectable()
export class UserSubscriptionRepository extends Repository<UserSubscription>{
    constructor(private readonly dataSource: DataSource){
        super(UserSubscription, dataSource.createEntityManager())
    }
}