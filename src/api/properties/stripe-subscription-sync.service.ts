import {UserSubscription} from "../../entities/user-subscription.entity";
import {UserSubscriptionRepository} from "../../repositories/user-subscription.repository";
import {UserRepository} from "../../repositories/user.repository";
import {StripeService} from "../stripe/stripe.service";
import {IsNull, Not} from "typeorm";
import {Cron} from "@nestjs/schedule";
import {Injectable} from "@nestjs/common";
@Injectable()
export class StripeSubscriptionSyncService {
    private readonly SPECIAL_USERS: Record<string, string[]> = {

        '53019dba-38f0-41a7-bab0-51e173f25744': [ // DEMO ACCOUNT - demo@moverlead.com - DemoAccount1.
            'price_1QqzAQP0ONo4d0beXhYCBw6k',
            'price_1Qr1xsP0ONo4d0beQV1hHcw8', // Maryland - Montgomery County
            'price_1Qr2oZP0ONo4d0beGzpaKPsJ', // New Jersey - Burlington County
            'price_1Qr2obP0ONo4d0beIK4cNNQo', // New Jersey - Camden County
            'price_1QqyIxP0ONo4d0beoOXICO2P', // Pennsylvania - Montgomery County
            'price_1QqyJ4P0ONo4d0beN9s3kKh8', // Pennsylvania - Philadelphia County
        ],
        '7d49a6e2-bcb2-46d6-81d8-67ad002ce6ff': [ // TEST ACCOUNT - yapyay2023@gmail.com
            'price_1Qqz9RP0ONo4d0bejgeN2zvj',
            'price_1QqzAbP0ONo4d0beqASL2zBU',
            'price_1QqzB3P0ONo4d0beLFLrSL8M',
            'price_1Qqz9dP0ONo4d0bepM3ak9EF',
            'price_1QqzAQP0ONo4d0beXhYCBw6k',
            'price_1QqzCJP0ONo4d0beGx4uJMZQ',
            'price_1Qr1xsP0ONo4d0beQV1hHcw8', // Maryland - Montgomery County
            'price_1Qr1xnP0ONo4d0beEEKYCSvH', // Maryland - Howard County
            'price_1Qr1xMP0ONo4d0bees1WWwVn', // Maryland - Anne Arundel County
            'price_1Qr1xuP0ONo4d0beRy55xs8p', // Maryland - Prince George's County
            'price_1Qr1xSP0ONo4d0be6MsNNCVB', // Maryland - Calvert County
            'price_1Qr1xbP0ONo4d0beB4UuCTta', // Maryland - Charles County
            'price_1Qr3y9P0ONo4d0beww3FBpEg', // Virginia - Loudoun County
            'price_1Qr3x8P0ONo4d0beiELuP9c1', // Virginia - Fairfax County
            'price_1Qr3zBP0ONo4d0bexZCoEDV9', // Virginia - Prince William County
            'price_1Rpwp4P0ONo4d0beiYFEncLU', // Washington DC
        ],
        '96898e61-f7f7-4035-ba54-e8878ebc7df6': [  // DJALLAL ACCOUNT - milo@vanexpressmoving.com
            'price_1Qr2oZP0ONo4d0beGzpaKPsJ', // New Jersey - Burlington County
            'price_1Qr2obP0ONo4d0beIK4cNNQo', // New Jersey - Camden County
            'price_1Qr2okP0ONo4d0besMt7HYmH', // New Jersey - Gloucester County
            'price_1Qr2p1P0ONo4d0be2RnJJdmo', // New Jersey - Ocean County
            'price_1QqyKRP0ONo4d0bexvxShe6V', // Pennsylvania - Bucks County
            'price_1QqyIEP0ONo4d0be2U1DkO0h', // Pennsylvania - Chester County
            'price_1QqyIQP0ONo4d0berrWWWvcx', // Pennsylvania - Delaware County
            'price_1QqyIxP0ONo4d0beoOXICO2P', // Pennsylvania - Montgomery County
            'price_1QqyJ4P0ONo4d0beN9s3kKh8', // Pennsylvania - Philadelphia County
        ],
    };

    constructor(
        private readonly userRepository: UserRepository,
        private readonly userSubscriptionRepository: UserSubscriptionRepository,
        private readonly stripeService: StripeService,
    ) {}

    async seedSpecialUsers() {
        for (const [userId, priceIds] of Object.entries(this.SPECIAL_USERS)) {
            await this.userSubscriptionRepository.delete({
                user: { id: userId },
            });

            const seen = new Set<string>();
            const rows = priceIds
                .filter(priceId => {
                    if (seen.has(priceId)) return false;
                    seen.add(priceId);
                    return true;
                })
                .map(priceId =>
                    this.userSubscriptionRepository.create({
                        user: { id: userId },
                        priceId,
                        status: 'active',
                    }),
                );
            console.log(`Seeding user ${userId} with priceIds:`, priceIds);
            await this.userSubscriptionRepository.save(rows);
        }
    }

    @Cron('*/59 * * * *')
    async syncAllUserSubscriptions() {
        if (process.env.DISABLE_CRON === 'true') {
            return;
        }

        console.log('Running syncAllUserSubscriptions');
        const specialUserIds = Object.keys(this.SPECIAL_USERS);

        const users = await this.userRepository.find({
            where: { stripeId: Not(IsNull()) },
        });

        for (const user of users) {
            if (specialUserIds.includes(user.id)) continue;

            const stripeSubs = await this.stripeService.getAllUserSubscriptions(user.stripeId);

            const seen = new Set<string>();
            const uniqueSubs = stripeSubs.filter(s => {
                if (seen.has(s.priceId)) return false;
                seen.add(s.priceId);
                return true;
            });

            await this.userSubscriptionRepository.delete({ user: { id: user.id } });
            const rows = uniqueSubs.map(s =>
                this.userSubscriptionRepository.create({
                    user:    { id: user.id },
                    priceId: s.priceId,
                    status:  'active',
                }),
            );
            await this.userSubscriptionRepository.save(rows);
        }

        await this.seedSpecialUsers();
    }
}
