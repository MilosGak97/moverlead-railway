import {BadRequestException, HttpException, HttpStatus, Injectable} from "@nestjs/common";
import Stripe from "stripe";
import {CreateCheckoutSessionDto} from "./dto/create-checkout-session.dto";
import {CountyRepository} from "../../repositories/county.repository";
import {UserRepository} from "../../repositories/user.repository";
import {CreateCheckoutSessionResponseDto} from "./dto/create-checkout-session-response.dto";
import {MyGateway} from "../../websocket/gateway";
import {CreateTopUpDto} from "./dto/create-top-up.dto";
import {TopUpTokenRepository} from "../../repositories/top-up-token.repository";
import {TopUpTokenStatus} from "../../enums/top-up-token-status.enum";
import {UserTokenRepository} from "../../repositories/user-token.repository";

@Injectable()
export class StripeService {
    private stripe: Stripe;

    constructor(
        private readonly countyRepository: CountyRepository,
        private readonly userRepository: UserRepository,
        private readonly topUpTokenRepository: TopUpTokenRepository,
        private readonly userTokenRepository: UserTokenRepository,
        private readonly gateway: MyGateway
    ) {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }

    async createCheckoutSessionMultiple(
        createCheckoutSessionDto: CreateCheckoutSessionDto,
        userId: string
    ): Promise<CreateCheckoutSessionResponseDto> {
        try {
            const user = await this.userRepository.findOne({where: {id: userId}});

            let stripeUserId = user?.stripeId;
            if (!stripeUserId) {
                const customer = await this.stripe.customers.create({
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`.trim(),
                    metadata: {
                        userId: user.id,
                    },
                });
                stripeUserId = customer.id;

                user.stripeId = stripeUserId;
                await this.userRepository.save(user);
            }

            const lineItems = createCheckoutSessionDto.priceIds.map((priceId) => {
                return {
                    price: priceId,
                    quantity: 1,
                };
            });

            const session = await this.stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                customer: stripeUserId,
                line_items: lineItems,
                mode: "subscription",
                success_url: `${process.env.SUCCESS_URL}`,
                cancel_url: `${process.env.CANCEL_URL}`,
            });

            return {
                checkoutUrl: session.url,
                checkoutId: session.id,
            };
        } catch (error) {
            console.error(error);
            throw new HttpException(
                "Stripe Error: Please contact your account manager",
                HttpStatus.BAD_REQUEST
            );
        }
    }

    async getAllActiveSubscriptions() {
        return this.stripe.subscriptions.list({
            status: "active",
        });
    }

    async getAllActiveSubscriptionsByUser(stripeCustomerId: string) {
        return this.stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "active",
        });
    }

    // this method gives us a priceIds in array of all active subscriptions from this user
    // then we can use priceIds to get counties
    async getAllUserSubscriptions(stripeCustomerId: string) {
        if (!stripeCustomerId || typeof stripeCustomerId !== 'string' || stripeCustomerId.trim().length === 0) {
            return [];
            //throw new Error('Stripe customer ID is missing or invalid.');
        }

        try {
            const allSubs = await this.stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: 'active',
            });

            const countySubscriptions: {
                priceId: string;
                startDate: number;
                endDate: number;
            }[] = [];

            for (const sub of allSubs.data) {
                const startDate = sub.current_period_start;
                const endDate = sub.current_period_end;

                for (const item of sub.items.data) {
                    countySubscriptions.push({
                        priceId: item.price.id,
                        startDate,
                        endDate,
                    });
                }
            }

            return countySubscriptions;
        } catch (error) {
            console.error(`❌ Error fetching subscriptions for ${stripeCustomerId}:`, error);
            throw new Error('Could not fetch subscriptions from Stripe.');
        }
    }

    // AFTER THE PAYMENT IS MADE
    async processWebhook(payload: any, sig: string) {
        try {
            const event = this.stripe.webhooks.constructEvent(
                payload,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );



            if (event.type === "checkout.session.completed") {

                const session = event.data.object as Stripe.Checkout.Session;

                // 1) Subscription flow
                if (session.mode === 'subscription' && session.subscription) {
                    // your existing logic
                    console.log('Subscription successful:', session.subscription);
                    this.gateway.sendPaymentSuccessEvent(session.subscription as string);
                }

                if (session.mode === 'payment' && session.metadata?.topUp === 'true') {
                    const userId = session.metadata.userId;
                    const tokenCount = Number(session.metadata.amountDollars); // set this correctly in createTopUpSession

                    if (!userId || isNaN(tokenCount)) {
                        console.warn('Missing metadata for top-up session', session.id);
                        return;
                    }

                    let userToken = await this.userTokenRepository.findOne({ where: { user: { id: userId } } });
                    if (!userToken) {
                        userToken = this.userTokenRepository.create({ user: { id: userId }, balance: '0' });
                    }

                    const currentBalance = parseFloat(userToken.balance ?? '0');
                    userToken.balance = (currentBalance + tokenCount).toFixed(2);
                    await this.userTokenRepository.save(userToken);

                    console.log(`✅ Top-up: Credited ${tokenCount} tokens to user ${userId}`);
                }
            }
            if (event.type === "checkout.session.expired") {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log("Payment Session has expired:", session);
            }

            // Top-up flow

            /*
            if(event.type === "charge.succeeded") {
                const object = event.data.object;
                if(object.outcome.network_status === 'approved_by_network'){
                    const amount = object.amount / 100;
                    const customerId = object.customer as string;
                    const user = await this.userRepository.findOne({where: {stripeId: customerId}});
                    if(!user) {
                        throw new BadRequestException('No user is found with provided stripe ID')
                    }
                    const userTokenEntity = await this.userTokenRepository.findOne({ where: { user: { id : user.id }}})
                    const currentBalance =  parseFloat(userTokenEntity.balance ?? '0');
                    userTokenEntity.balance = (currentBalance + amount).toFixed(2)
                    await this.userTokenRepository.save(userTokenEntity);
                }
            }
*/
            return {success: true};
        } catch (err) {
            console.error("Webhook Error:", err.message);
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }

    async ensureStripeCustomer(userId: string){
        // 1) Load your user
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // 2) If they already have a stripeId, return it immediately
        if (user.stripeId) {
            return user.stripeId;
        }

        // 3) Otherwise, create a new Customer in Stripe
        const customer = await this.stripe.customers.create({
            email: user.email,
            name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
            metadata: { userId: user.id },
        });

        // 4) Save the new stripeId on your User record
        user.stripeId = customer.id;
        await this.userRepository.save(user);

        return customer.id;
    }
    async createTopUpSession(
        dto: CreateTopUpDto,
        userId: string,
    ): Promise<CreateCheckoutSessionResponseDto> {
        const stripeId = await this.ensureStripeCustomer(userId);

        const amountDollars = dto.amount; // Now it's dollars, e.g., 25 for $25
        const amountCents = amountDollars * 100;

        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer: stripeId,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Account Top-Up',
                        description: `Adds $${amountDollars.toFixed(2)} to your account`,
                    },
                    unit_amount: amountCents, // full amount in cents
                },
                quantity: 1, // customer pays once per top-up
            }],
            success_url: `${process.env.TOP_UP_URL}`,
            cancel_url: process.env.CANCEL_URL,
            metadata: {
                userId,
                amountDollars: amountDollars.toString(),
                topUp: 'true',
            },
        });

        return {
            checkoutUrl: session.url!,
            checkoutId: session.id,
        };
    }

}
