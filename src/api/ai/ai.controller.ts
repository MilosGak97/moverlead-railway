import {Body, Controller, Post} from '@nestjs/common';
import {AiService} from "./ai.service";
import {AiFilteringDto} from "./dto/ai-filtering-dto";
import {ApiTags} from "@nestjs/swagger";

@ApiTags('ai')
@Controller('ai')
export class AiController {
    constructor(private readonly aiService: AiService) {
    }

    @Post('filtering')
    async filtering(@Body() aiFilteringDto: AiFilteringDto){
        return this.aiService.classifyProperty(aiFilteringDto);
    }
    @Post('filtering/batch')
    async filteringBatch(@Body() aiFilteringDto: AiFilteringDto){
        return this.aiService.classifyPropertyBatch(aiFilteringDto);
    }
}
