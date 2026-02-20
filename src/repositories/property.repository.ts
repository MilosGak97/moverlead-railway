import {BadRequestException, HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {DataSource, In, IsNull, Not, Repository} from 'typeorm';
import {Property} from '../entities/property.entity';
import {CountyRepository} from './county.repository';

@Injectable()
export class PropertyRepository extends Repository<Property> {
    constructor(
        private readonly dataSource: DataSource,
        private readonly countyRepository: CountyRepository,
    ) {
        super(Property, dataSource.createEntityManager());
    }

}
