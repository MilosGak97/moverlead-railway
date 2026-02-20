import {Module} from "@nestjs/common";
import {AuthModule} from "./api/auth/auth.module";
import {TypeOrmModule} from "@nestjs/typeorm";
import {User} from "./entities/user.entity";
import {UsersModule} from "./api/users/users.module";
import {AwsModule} from "./api/aws/aws.module";
import {Property} from "./entities/property.entity";
import {PropertiesModule} from "./api/properties/properties.module";
import {SettingsModule} from "./api/settings/settings.module";
import {StripeModule} from "./api/stripe/stripe.module";
import {County} from "./entities/county.entity";
import {WebsocketModule} from "./websocket/websocket.module";
import {ScrapperModule} from "./api/scrapper/scrapper.module";
import {BullModule} from "@nestjs/bull";
import {CommonModule} from './api/common/common.module';
import {PostcardTemplate} from "./entities/postcard-template.entity";
import {PropertyAiFiltering} from "./entities/property-ai-filtering.entity";
import {PropertyHomeownerEnrichment} from "./entities/property-homeowner-enrichment.entity";
import {PropertyListing} from "./entities/property-listing.entity";
import {TopUpToken} from "./entities/top-up-token.entity";
import {UserExtrasAccess} from "./entities/user-extras-access.entity";
import {UserPropertyFiltering} from "./entities/user-property-filtering.entity";
import {UserSubscription} from "./entities/user-subscription.entity";
import {UserToken} from "./entities/user-token.entity";
import {UserVisibleListing} from "./entities/user-visible-listing.entity";
import {LobModule} from "./api/lob/lob.module";
import {ScheduleModule} from "@nestjs/schedule";
import {Dealmachine} from "./entities/dealmachine.entity";
import { GmailModule } from './api/gmail/gmail.module';

const entities = [
    User,
    Property,
    County,
    PostcardTemplate,
    PropertyAiFiltering,
    PropertyHomeownerEnrichment,
    PropertyListing,
    TopUpToken,
    UserExtrasAccess,
    UserPropertyFiltering,
    UserSubscription,
    UserToken,
    UserVisibleListing,
    Dealmachine,
];

const resolveRedisConfig = () => {
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        try {
            const parsedRedisUrl = new URL(redisUrl);

            const redisFromUrl: {
                host: string;
                port: number;
                username?: string;
                password?: string;
                tls?: Record<string, never>;
            } = {
                host: parsedRedisUrl.hostname,
                port: Number(parsedRedisUrl.port || 6379),
            };

            if (parsedRedisUrl.username) {
                redisFromUrl.username = decodeURIComponent(parsedRedisUrl.username);
            }

            if (parsedRedisUrl.password) {
                redisFromUrl.password = decodeURIComponent(parsedRedisUrl.password);
            }

            if (parsedRedisUrl.protocol === "rediss:") {
                redisFromUrl.tls = {};
            }

            return redisFromUrl;
        } catch (_error) {
            // Ignore malformed REDIS_URL and fallback to explicit host/port variables.
        }
    }

    return {
        host: process.env.REDIS_HOST ?? process.env.REDISHOST,
        port: Number(process.env.REDIS_PORT ?? process.env.REDISPORT ?? 6379),
        username: process.env.REDIS_USERNAME ?? process.env.REDISUSER,
        password: process.env.REDIS_PASSWORD ?? process.env.REDISPASSWORD,
    };
};

const getTypeOrmConfig = () => {
    const databaseUrl = process.env.DATABASE_URL;
    const sslEnabled = process.env.DB_SSL !== "false";
    const common = {
        type: "postgres" as const,
        synchronize: true,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        entities,
    };

    if (databaseUrl) {
        return {
            ...common,
            url: databaseUrl,
        };
    }

    return {
        ...common,
        host: process.env.DB_HOST ?? process.env.PGHOST,
        port: Number(process.env.DB_PORT ?? process.env.PGPORT ?? 5432),
        database: process.env.DB_NAME ?? process.env.PGDATABASE,
        username: process.env.DB_USERNAME ?? process.env.PGUSER,
        password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
    };
};

let imports = [
    ScheduleModule.forRoot(),
    BullModule.forRoot({
        redis: resolveRedisConfig(),
    }),
    AuthModule,
    TypeOrmModule.forRoot(getTypeOrmConfig()),
    UsersModule,
    AwsModule,
    PropertiesModule,
    SettingsModule,
    StripeModule,
    WebsocketModule,
    ScrapperModule,
    CommonModule,
    LobModule,
    GmailModule,
];

@Module({
    imports: imports,
})
export class AppModule {
}
