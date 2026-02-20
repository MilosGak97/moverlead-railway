import {Body, Controller, Get, Param, Post, Query} from "@nestjs/common";
import {ScrapperService} from "./scrapper.service";
import {ApiOperation, ApiTags} from "@nestjs/swagger";
import {InjectQueue} from "@nestjs/bull";
import {FetchDataDto} from "../properties/dto/fetch-data.dto";
import {StartScrapperDto} from "./dto/start-scrapper.dto";
import {BrightdataEnrichmentFillerDto} from "./dto/brightdata-enrichment-filler.dto";
import {RunScrapperV2Dto} from "./dto/run-scrapper-v2.dto";
import {GetZillowUrlsForCountyDto} from "./dto/get-zillow-urls-for-county-dto";
import {BrightdataService} from "./brightdata.service";
import {BrightdataEnrichmentTriggerDto} from "./dto/brightdata-enrichment-trigger-dto";
import {HasdataService} from "./hasdata.service";
import {TestScrapperDto} from "./dto/test-scrapper.dto";

import { Queue, Job, JobCounts, JobStatus } from "bull";


@ApiTags("scrapper")
@Controller("scrapper")
export class ScrapperController {
    constructor(
        private readonly scrapperService: ScrapperService,
        private readonly brightdataService: BrightdataService,
        private readonly hasdataService: HasdataService,
        @InjectQueue("scrapper") private readonly scrapperQueue: Queue
    ) {
    }
    @Post('local/process-snapshots')
    async triggerLocalProcess(@Body()  dto: FetchDataDto) {
        // schedule it to run just after the response is sent
        setImmediate(() =>
            this.scrapperService.processSnapshotsSequentially(dto.initialScrapper)
                .catch(err => console.log('Background snapshot error', err))
        );

        return { message: 'Snapshot processing started in background.' };
    }



    @Get('redis/stats')
    async getQueueStats(): Promise<JobCounts> {
        return this.scrapperQueue.getJobCounts();
    }

    /**
     * GET /scrapper/redis/jobs/:state
     */
    @Get('redis/jobs/:state')
    async getJobsByState(
        @Param('state') state: string  // comes in as string
    ): Promise<Job[]> {
        // cast to JobStatus so TS is happy
        const status = state as JobStatus;
        return this.scrapperQueue.getJobs([status]);
    }

    /**
     * GET /scrapper/redis/job/:id
     */
    @Get('redis/job/:id')
    async getJobById(@Param('id') id: string) {
        const job = await this.scrapperQueue.getJob(id);
        if (!job) {
            return { error: `No job with id ${id}` };
        }
        return {
            id: job.id,
            name: job.name,
            data: job.data,
            opts: job.opts,
            attemptsMade: job.attemptsMade,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            stacktrace: job.stacktrace,
            returnvalue: job.returnvalue,
        };
    }


    @Post('reddis/trigger-scrapping')
    async startScrapper(@Body() startScrapperDto: StartScrapperDto) {
        const job = await this.scrapperService.enqueueScrapJob(startScrapperDto.initialScrapper);
        return { message: 'Scrapper job has been queued', jobId: job.id };
    }

    @ApiOperation({ summary: 'Enqueue scrapper for all counties with Zillow data' })
    @Post('reddis/trigger-scrapping-v2')
    async startScrapperV2(@Body() startScrapperDto: StartScrapperDto) {
        const job = await this.scrapperService.enqueueScrapJob(
            startScrapperDto.initialScrapper,
            { useZillowCounties: true },
        );
        return { message: 'Scrapper v2 job has been queued', jobId: job.id };
    }
    /*
    async startScrapper(@Body() startScrapperDto: StartScrapperDto) {
        const job = await this.scrapperQueue.add("scrapJob", startScrapperDto);
        console.log("INITIAL SCRAPPER VALUE DTO: " + startScrapperDto.initialScrapper);
        console.log(`Job enqueued with ID: ${job.id}`);
        return {message: "Scrapper job has been queued"};
    }

     */

    @Post('run-failed')
    async runFailedScrapper(){
        await this.scrapperService.runFailedScrapper(false, 'residential')
    }


    @ApiOperation({ summary: 'Enqueue a fetch-batch-data job' })
    @Post('reddis/trigger-fetch-batch')
    async triggerFetchBatch(@Body() dto: FetchDataDto) {
        await this.scrapperQueue.add('fetchBatchJob', dto);
        return { message: 'Fetch-batch job queued' };
    }

    @Post('test-scrapper')
    async testScrapper(@Body() testScrapperDto: TestScrapperDto){
        return await this.scrapperService.chicagoScrapper(testScrapperDto.initialScrapper)
    }
/*
    @Post('fetch-data')
    async fetchData(@Body() fetchDataDto: FetchDataDto) {
        return await this.scrapperService.fetchDataBatch(fetchDataDto.initialScrapper)
    }
*/

    @ApiOperation({ description: "Trigger brightdata"})
    @Post('brightdata/trigger')
    async brightdataEnrichmentTrigger(@Query() brightdataEnrichmentTriggerDto: BrightdataEnrichmentTriggerDto) {
        return await this.brightdataService.brightdataEnrichmentTrigger(brightdataEnrichmentTriggerDto.brightdataVersion)
    }

    @Post('brightdata/filler')
    async brightdataEnrichmentFiller(@Query() brightdataEnrichmentFillerDto: BrightdataEnrichmentFillerDto) {
        return await this.brightdataService.brightdataEnrichmentFiller(brightdataEnrichmentFillerDto.brightdataVersion, brightdataEnrichmentFillerDto.snapshotId)
    }

    @Post('hasdata/trigger')
    async hasdataProperty(){
        return await this.hasdataService.hasdataEnrichmentTrigger()
    }


    @Post('cancel-all')
    async cancelAllJobs() {
        // Pause the queue to stop processing new jobs.
        await this.scrapperQueue.pause(true);

        // Obliterate the queue to remove all jobs (force flag ensures removal).
        await this.scrapperQueue.obliterate({force: true});

        // Optionally, you can also close the queue to release resources:
        // await this.scrapperQueue.close();
        // process.exit(0); // Use with caution: forcefully stops the process.

        return {message: "All jobs have been cancelled and the queue has been cleared."};
    }

    @Post('resume')
    async resumeQueue() {
        await this.scrapperQueue.resume();
        return {message: "Queue has been resumed."};
    }


    @Post('get-zillow-urls-for-county')
    async getZillowUrlsForCounty(@Body() getZillowUrlsForCountyDto: GetZillowUrlsForCountyDto) {
        return await this.scrapperService.getZillowUrlsForCounty(getZillowUrlsForCountyDto.urls);
    }

    @Post('run-scrapper-v2')
    async runScrapperV2(@Body() runScrapperV2Dto: RunScrapperV2Dto) {
        return await this.scrapperService.runScrapperV2(runScrapperV2Dto.initialScrapper)
    }

    @Post('retry-failed-scrapper')
    async retryFailedScrapper(@Body() runScrapperV2Dto: RunScrapperV2Dto) {
        const { initialScrapper } = runScrapperV2Dto;

        for (let i = 0; i < 5; i++) {

            await this.scrapperService.runFailedScrapper(initialScrapper, 'residential');
        }

        return { message: 'Retrying failed scrapper completed' };
    }

    @Post('run-scrapper-manually')
    async runScrapperManually(){
        await this.scrapperService.runScrapperV2(false)
        return 'DONE'
    }


}
