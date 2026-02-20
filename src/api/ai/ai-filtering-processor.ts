// src/api/processors/ai-filtering.processor.ts

import { Processor, Process, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {AiService} from "./ai.service";
import {PropertyAiFiltering} from "../../entities/property-ai-filtering.entity";
import {UserExtrasAccess} from "../../entities/user-extras-access.entity";
import {AiFilteringJobStatus} from "../../enums/ai-filtering-job-status.enum";
import {UserExtrasAccessType} from "../../enums/user-extras-access-type.enum";
import {MyGateway} from "../../websocket/gateway";
import {UserExtrasAccessRepository} from "../../repositories/user-extras-access.repository";
import {PropertyAiFilteringRepository} from "../../repositories/property-ai-filtering.repository";

@Processor('ai-filtering')
@Injectable()
export class AiFilteringProcessor {
    private readonly logger = new Logger(AiFilteringProcessor.name);

    constructor(
        private readonly propertyAiFilteringRepo: PropertyAiFilteringRepository,
        private readonly userExtrasAccessRepo: UserExtrasAccessRepository,
        private readonly aiService: AiService,
        private readonly wsGateway: MyGateway, // for notifying the frontend

        // (optional) if you need to re‐enqueue or move jobs, you can inject the queue
        @InjectQueue('ai-filtering')
        private readonly aiFilteringQueue: Queue,
    ) {}

    /**
     * Every job data: { propertyId, photos, userId }
     */
    @Process({ name: 'classify-property', concurrency: 15 })
    async handleAiFilterJob(job: Job<{ propertyId: string; photos: any[]; userId: string }>) {
        const { propertyId, photos, userId } = job.data;

        try {
            // 1) Call classifyPropertyBatch, which returns { id, counts, verdict, raw }
            const aiResponse = await this.aiService.classifyPropertyBatch({
                propertyId,
                photos,
            });

            // 2) Update property_ai_filtering: set filteredStatus, rawResponse, jobStatus = COMPLETED
            await this.propertyAiFilteringRepo.update(
                { property: { id: propertyId } as any },
                {
                    filteredStatus: aiResponse.verdict as any,
                    rawResponse: JSON.stringify(aiResponse),
                    jobStatus: AiFilteringJobStatus.COMPLETED,
                },
            );

            // 3) Grant UserExtrasAccess only if it doesn’t already exist
            const existingGrant = await this.userExtrasAccessRepo.findOne({
                where: {
                    user: { id: userId } as any,
                    property: { id: propertyId } as any,
                    accessType: UserExtrasAccessType.AI_FILTERING,
                },
            });

            if (!existingGrant) {
                await this.userExtrasAccessRepo.insert({
                    user: { id: userId } as any,
                    property: { id: propertyId } as any,
                    accessType: UserExtrasAccessType.AI_FILTERING,
                    tokenUsed: '0.03', // or whatever logic you have
                    // grantedAt will auto‐populate
                });
            }

            // 4) Notify the frontend (via WebSocket) that “propertyId” is done
           //this.wsGateway.notifyAiFilteringDone(userId, propertyId, aiResponse.verdict);

            this.logger.log(`AI filtering completed for property ${propertyId}`);
        } catch (err) {
            this.logger.error(`AI filtering failed for property ${propertyId}: ${err.message}`);

            // 5) Mark jobStatus = FAILED, and store error in rawResponse if you like
            await this.propertyAiFilteringRepo.update(
                { property: { id: propertyId } as any },
                {
                    jobStatus: AiFilteringJobStatus.FAILED,
                    rawResponse: `ERROR: ${err.message}`,
                },
            );
        }
    }

    @OnQueueFailed()
    async onFailed(job: Job, error: any) {
        this.logger.error(`Job ${job.id} in queue ai-filtering failed: ${error.message}`);
        // The “catch” block above should already have marked the DB as FAILED;
        // but if you want extra logic on a queue‐level failure, do it here.
    }
}
