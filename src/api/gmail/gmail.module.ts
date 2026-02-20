// src/gmail/gmail.module.ts
import {forwardRef, Module} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { GmailService } from './gmail.service';
import {PropertiesModule} from "../properties/properties.module";

@Module({
    imports: [
        ScheduleModule.forRoot(),
        HttpModule,
        forwardRef(() => PropertiesModule),
    ],
    providers: [GmailService],
    exports: [GmailService],
})
export class GmailModule {}