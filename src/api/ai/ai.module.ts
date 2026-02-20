import {Global, Module} from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Global()
@Module({
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
