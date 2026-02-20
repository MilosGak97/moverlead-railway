import {Process, Processor} from "@nestjs/bull";
import {Logger} from "@nestjs/common";
import {LobService} from "./lob.service";
import {Job } from 'bull';
import {SendPostcardJobDto} from "./dto/send-postcard.dto";

@Processor('postcards')
export class PostcardsProcessor {
    private readonly logger = new Logger(PostcardsProcessor.name);

    constructor(private readonly lobService: LobService) {}

    @Process({
        name: 'sendOnePostcard',
        concurrency: 5, // send 5 in parallel — tune based on Lob's rate limits
    })
    async handleSendPostcard(job: Job<SendPostcardJobDto>) {
        const sendPostcardDto = job.data; // use job.data directly

        try {
            await this.lobService.sendOnePostcard(sendPostcardDto);
        } catch (err) {
            this.logger.error(`❌ Failed to send postcard for listing: ${err.message}`);
            throw err;
        }
    }
}