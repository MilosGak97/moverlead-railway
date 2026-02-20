import {DataSource, Repository} from "typeorm";
import {Injectable} from "@nestjs/common";
import {PropertyAiFiltering} from "../entities/property-ai-filtering.entity";

@Injectable()
export class PropertyAiFilteringRepository extends Repository<PropertyAiFiltering>{
    constructor(
        private readonly dataSource: DataSource,
    ) {
        super(PropertyAiFiltering, dataSource.createEntityManager() );
    }


}