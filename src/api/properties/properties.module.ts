import {forwardRef, Module} from "@nestjs/common";
import {PropertiesController} from "./properties.controller";
import {PropertiesService} from "./properties.service";
import {TypeOrmModule} from "@nestjs/typeorm";
import {Property} from "../../entities/property.entity";
import {User} from "../../entities/user.entity";
import {PropertyRepository} from "../../repositories/property.repository";
import {UserRepository} from "../../repositories/user.repository";
import {HttpModule} from "@nestjs/axios";
import {CountyRepository} from "../../repositories/county.repository";
import {County} from "../../entities/county.entity";
import {StripeService} from "../stripe/stripe.service";
import {MyGateway} from "../../websocket/gateway";
import {ScrapperModule} from "../scrapper/scrapper.module";
import {PropertyHomeownerEnrichmentRepository} from "../../repositories/property-homeowner-enrichment.repository";
import {PropertyListingRepository} from "../../repositories/property-listing.repository";
import {UserPropertyFilteringRepository} from "../../repositories/user-property-filtering.repository";
import {UserVisibleListingRepository} from "../../repositories/user-visible-listing.repository";
import {UserExtrasAccessRepository} from "../../repositories/user-extras-access.repository";
import {UserSubscriptionRepository} from "../../repositories/user-subscription.repository";
import {StripeSubscriptionSyncService} from "./stripe-subscription-sync.service";
import {UserSubscription} from "../../entities/user-subscription.entity";
import {UserTokenModule} from "../user-token/user-token.module";
import {TopUpTokenRepository} from "../../repositories/top-up-token.repository";
import {UserTokenRepository} from "../../repositories/user-token.repository";
import {PropertyAiFilteringRepository} from "../../repositories/property-ai-filtering.repository";
import {PropertyAiFiltering} from "../../entities/property-ai-filtering.entity";
import {BullModule} from "@nestjs/bull";
import {AiFilteringProcessor} from "../ai/ai-filtering-processor";
import {AiService} from "../ai/ai.service";
import {Dealmachine} from "../../entities/dealmachine.entity";
import {DealmachineRepository} from "../../repositories/dealmachine.repository";
import {GmailService} from "../gmail/gmail.service";
import {GmailModule} from "../gmail/gmail.module";

@Module({
    imports: [
        TypeOrmModule.forFeature([Property, User, County, UserSubscription, PropertyAiFiltering, Dealmachine]),
        HttpModule,
        forwardRef(() => ScrapperModule),
        UserTokenModule,
        BullModule.registerQueue({
            name: "ai-filtering",
        }),
        forwardRef(() => GmailModule),
    ],
    controllers: [PropertiesController],
    providers: [
        PropertiesService,
        PropertyRepository,
        PropertyHomeownerEnrichmentRepository,
        PropertyListingRepository,
        UserPropertyFilteringRepository,
        UserVisibleListingRepository,
        UserRepository,
        CountyRepository,
        StripeService,
        MyGateway,
        UserExtrasAccessRepository,
        UserSubscriptionRepository,
        StripeSubscriptionSyncService,
        TopUpTokenRepository,
        UserTokenRepository,
        PropertyAiFilteringRepository,
        AiFilteringProcessor,   // ← **add your processor here**
        AiService,
        DealmachineRepository,
    ],
    exports: [PropertiesService],
})
export class PropertiesModule {
}
