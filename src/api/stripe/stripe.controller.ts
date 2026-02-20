import {Body, Controller, Param, Post, Req, Res, UseGuards} from '@nestjs/common';
import {StripeService} from './stripe.service';
import {CreateCheckoutSessionDto} from './dto/create-checkout-session.dto';
import {Request, Response} from 'express';
import {UserId} from '../auth/user-id.decorator';
import {CreateCheckoutSessionResponseDto} from './dto/create-checkout-session-response.dto';
import {ApiOkResponse, ApiOperation, ApiTags} from '@nestjs/swagger';
import {CreateTopUpDto} from "./dto/create-top-up.dto";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {Public} from "../auth/public.decorator";

@ApiTags('stripe')
@UseGuards(JwtAuthGuard)
@Controller('stripe')
export class StripeController {
    constructor(private readonly stripeService: StripeService) {
    }

    @Post('checkout-session/multiple')
    @ApiOkResponse({type: CreateCheckoutSessionResponseDto})
    @ApiOperation({summary: 'Create stripe checkout'})
    async createCheckoutSessionMultiple(
        @Body() createCheckoutSessionDto: CreateCheckoutSessionDto,
        @Req() req: Request & { userId?: string },
    ): Promise<CreateCheckoutSessionResponseDto> {
        console.log('Read User ID: ' + req.userId);

        console.log('Read Type User ID: ' + typeof  req.userId);
        return await this.stripeService.createCheckoutSessionMultiple(
            createCheckoutSessionDto,
            req.userId,
        );
    }
    @Public()
    @Post('webhook')
    @ApiOperation({ summary: 'Webhook for stripe' })
    async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
        const sig = req.headers['stripe-signature'] as string;

        if (!sig) {
            console.warn('⚠️ Stripe webhook received without a signature header');
            return res.status(400).json({
                message: 'Missing Stripe signature header',
            });
        }

        try {
            const rawBody = (req as any).rawBody;

            console.log('📥 Stripe webhook incoming');
            console.log('→ Signature header:', sig);
            console.log('→ Raw body is buffer:', Buffer.isBuffer(rawBody));
            console.log('→ Raw body length:', rawBody?.length ?? 'N/A');

            if (!Buffer.isBuffer(rawBody)) {
                throw new Error('Raw body is not a Buffer. Signature verification will fail.');
            }

            const result = await this.stripeService.processWebhook(rawBody, sig);
            console.log('✅ Webhook processed successfully:', result);

            return res.status(200).send({ received: true });
        } catch (err) {
            console.error('❌ Webhook processing error:', err);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    @Post('user-subscriptions/:stripeCustomerId')
    async getUserSubscriptions(@Param('stripeCustomerId') stripeCustomerId: string) {
        return this.stripeService.getAllUserSubscriptions(stripeCustomerId);
    }


    @Post('top-up')
    @ApiOperation({ summary: 'Create a Stripe Checkout session for a one-off top-up' })
    @ApiOkResponse({ type: CreateCheckoutSessionResponseDto })
    async createTopUp(
        @Body() dto: CreateTopUpDto,
        @UserId() userId: string,
    )//: Promise<CreateCheckoutSessionResponseDto>
    {
        return this.stripeService.createTopUpSession(dto, userId);
    }
}
