import {Module} from '@nestjs/common';
import {CommonController} from './common.controller';
import {CommonService} from './common.service';
import {EmailService} from "../aws/services/email.service";

@Module({
    controllers: [CommonController],
    providers: [
        CommonService,
        EmailService,
    ]
})
export class CommonModule {
}
