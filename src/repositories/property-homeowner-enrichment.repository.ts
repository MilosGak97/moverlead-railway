import {DataSource, Repository} from "typeorm";
import {PropertyHomeownerEnrichment} from "../entities/property-homeowner-enrichment.entity";
import {Injectable} from "@nestjs/common";

@Injectable()
export class PropertyHomeownerEnrichmentRepository extends Repository<PropertyHomeownerEnrichment>{
    constructor(
        private readonly dataSource: DataSource,
    ) {
        super(PropertyHomeownerEnrichment, dataSource.createEntityManager() );
    }


}