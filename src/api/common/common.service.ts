import {Injectable} from '@nestjs/common';
import {EmailService} from "../aws/services/email.service";
import {ContactFormWebhookDto} from "./dto/contact-form-webhook.dto";
import {PostcardFormWebhookDto} from "./dto/postcard-form-webhook.dto";
import {SubscribeToBlogDto} from "./dto/susbscribe-to-blog.dto";

@Injectable()
export class CommonService {
    constructor(private readonly emailService: EmailService) {
    }

    async contactFormWebhook(contactFormWebhookDto: ContactFormWebhookDto){
        return await this.emailService.contactFormEmail(contactFormWebhookDto);
    }

    async postcardFormWebhook(postcardFormWebhookDto: PostcardFormWebhookDto) {
        return await this.emailService.postcardOrderEmail(postcardFormWebhookDto);
    }

    async subscribeToBlogWebhook(subscribeToBlogDto: SubscribeToBlogDto){
        return await this.emailService.susbcribeToBlogEmail(subscribeToBlogDto.email)
    }

    async incomingWebhook(payload: unknown, meta?: { query?: unknown; path?: string; method?: string }) {
        return await this.emailService.incomingWebhookEmail(payload, meta);
    }
}
