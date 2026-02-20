import {TopUpToken} from "../entities/top-up-token.entity";
import {DataSource, Repository} from "typeorm";
import {Injectable} from "@nestjs/common";

@Injectable()
export class TopUpTokenRepository extends Repository<TopUpToken>{
    constructor(
        private readonly dataSource: DataSource
    ){
       super(TopUpToken, dataSource.createEntityManager())
    }


}