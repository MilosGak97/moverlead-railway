import {Injectable} from "@nestjs/common";
import {Dealmachine} from "../entities/dealmachine.entity";
import {DataSource, Repository} from "typeorm";

@Injectable()
export class DealmachineRepository extends Repository<Dealmachine>{
    constructor(
        private readonly dataSource: DataSource,
    ) {
        super(Dealmachine, dataSource.createEntityManager());
    }


}