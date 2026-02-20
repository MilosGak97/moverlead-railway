import {Body, Controller, Post, Req, Res} from '@nestjs/common';
import {ApiBody, ApiOperation, ApiTags} from "@nestjs/swagger";
import {Public} from "../auth/public.decorator";
import {Request, Response} from "express";
import {ContactFormWebhookDto} from "./dto/contact-form-webhook.dto";
import {SubscribeToBlogDto} from "./dto/susbscribe-to-blog.dto";
import {PostcardFormWebhookDto} from "./dto/postcard-form-webhook.dto";
import {CommonService} from "./common.service";

@ApiTags('common')
@Controller('common')
export class CommonController {
    constructor(private readonly commonService: CommonService) {}
    @Post('webhook/contact-form')
    @ApiOperation({summary: 'General webhook'})
    async contactFormWebhook(@Body() contactFormWebhookDto: ContactFormWebhookDto, @Res() res: Response) {
        console.log('Received form data:', contactFormWebhookDto);
        await this.commonService.contactFormWebhook(contactFormWebhookDto);
        // Save to DB, forward to email, etc.
        res.status(200).json({ message: 'Form received', data: contactFormWebhookDto });
    }

    @Post('webhook/postcard-form')
    @ApiOperation({summary: 'General webhook'})
    async postcardFormWebhook(@Body() postcardFormDto: PostcardFormWebhookDto, @Res() res: Response) {
        console.log('Received form data:', postcardFormDto);
        await this.commonService.postcardFormWebhook(postcardFormDto)
        // Save to DB, forward to email, etc.
        res.status(200).json({ message: 'Form received', data: postcardFormDto });
    }

    @Post('webhook/subscribe-to-blog')
    @ApiOperation({summary: 'General webhook'})
    async subscribeToBlogWebhook(@Body() subscribeToBlogDto: SubscribeToBlogDto, @Res() res: Response) {
        console.log('Received form data:', subscribeToBlogDto);
        await this.commonService.subscribeToBlogWebhook(subscribeToBlogDto);
        // Save to DB, forward to email, etc.
        res.status(200).json({ message: 'Form received', data: subscribeToBlogDto });
    }

    @Post('webhook/lazhar')
    @Public()
    @ApiBody({
        description: 'Any JSON payload',
        schema: {
            type: 'object',
            additionalProperties: true,
            example: {
                event: 'test',
                source: 'swagger',
                data: { foo: 'bar', count: 123 },
            },
        },
    })
    @ApiOperation({summary: 'Forward any payload to lazhar@moverlead.com'})
    async lazharWebhook(@Body() payload: unknown, @Req() req: Request, @Res() res: Response) {
        console.log('Received webhook payload:', payload);
        await this.commonService.incomingWebhook(payload, {
            query: req.query,
            path: req.originalUrl,
            method: req.method,
        });
        res.status(200).json({ message: 'Webhook received' });
    }

}
