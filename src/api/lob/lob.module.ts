import { Module } from '@nestjs/common';
import { LobController } from './lob.controller';
import { LobService } from './lob.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {PostcardTemplate} from "../../entities/postcard-template.entity";
import {PostcardTemplateRepository} from "../../repositories/postcard-template.repository";
import {UserRepository} from "../../repositories/user.repository";
import {PropertyListingRepository} from "../../repositories/property-listing.repository";
import {UserExtrasAccessRepository} from "../../repositories/user-extras-access.repository";
import {PropertyHomeownerEnrichmentRepository} from "../../repositories/property-homeowner-enrichment.repository";
import { BullModule } from "@nestjs/bull";
import {PostcardsProcessor} from "./lob.processor";
import {UserTokenService} from "../user-token/user-token.service";
import {UserTokenRepository} from "../../repositories/user-token.repository";

@Module({
  imports:[
    TypeOrmModule.forFeature([PostcardTemplate]),
        BullModule.registerQueue({
            name: 'postcards',
        }),
      ],
  controllers: [LobController],
  providers: [
      LobService,
      PostcardsProcessor,
      PostcardTemplateRepository,
      UserRepository,
      PropertyListingRepository,
      UserExtrasAccessRepository,
      PropertyHomeownerEnrichmentRepository,
      UserTokenRepository,
      UserTokenService
  ],

})
export class LobModule {}
