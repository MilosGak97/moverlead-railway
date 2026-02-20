import {Injectable} from "@nestjs/common";
import {DataSource, Repository} from "typeorm";
import {PostcardTemplate} from "../entities/postcard-template.entity";

@Injectable()
export class PostcardTemplateRepository extends Repository<PostcardTemplate> {
    constructor(
        private readonly dataSource: DataSource
    ) {
        super(PostcardTemplate, dataSource.createEntityManager());
    }


}