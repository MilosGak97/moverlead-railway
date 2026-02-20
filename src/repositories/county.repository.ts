import {DataSource, Repository} from 'typeorm';
import {County} from '../entities/county.entity';
import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {GetProductsDto} from '../api/properties/dto/get-products-dto';
import {GetProductsResponseDto} from "../api/properties/dto/get-products-response.dto";

@Injectable()
export class CountyRepository extends Repository<County> {
    constructor(private readonly dataSource: DataSource) {
        super(County, dataSource.createEntityManager());
    }

    async getProducts(getProductsDto: GetProductsDto): Promise<GetProductsResponseDto[]> {
        const excludedCounties = [
            // TX
           // {name: 'Harris County', state: 'TX'},

            // NY
            {name: 'Orange County', state: 'NY'},
            {name: 'Rockland County', state: 'NY'},

            // NJ
            {name: 'Warren County', state: 'NJ'},
            {name: 'Sussex County', state: 'NJ'},
            {name: 'Hunterdon County', state: 'NJ'},
            {name: 'Morris County', state: 'NJ'},
            {name: 'Passaic County', state: 'NJ'},
            {name: 'Somerset County', state: 'NJ'},
            {name: 'Mercer County', state: 'NJ'},
            {name: 'Middlesex County', state: 'NJ'},
            {name: 'Monmouth County', state: 'NJ'},
            {name: 'Essex County', state: 'NJ'},
            {name: 'Union County', state: 'NJ'},
            {name: 'Hudson County', state: 'NJ'},
            {name: 'Bergen County', state: 'NJ'},
            {name: 'Burlington County', state: 'NJ'},
            {name: 'Camden County', state: 'NJ'},
            {name: 'Gloucester County', state: 'NJ'},
            {name: 'Salem County', state: 'NJ'},

        ];


        const counties: County[] = await this.find({where: {state: getProductsDto.state}});
        if (!counties && counties.length === 0) {
            throw new HttpException('No counties found', HttpStatus.BAD_REQUEST)
        }

        const response: GetProductsResponseDto[] = counties.filter((county) => {
            return !excludedCounties.some(
                (excluded) =>
                    excluded.name.toLowerCase() === county.name.toLowerCase() &&
                    excluded.state.toLowerCase() === county.state.toLowerCase()
            )
        }).map((county) => ({
            id: county.id,
            name: county.name,
            amount: county.amount,
            state: county.state,
            priceId: county.priceId
        }))

        return response;


    }
}
