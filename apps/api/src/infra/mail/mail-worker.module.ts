import { Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor.js';
import { MailModule } from './mail.module.js';

/** Consumer side: registered only in the worker process (or APP_ROLE=all). */
@Module({ imports: [MailModule], providers: [EmailProcessor] })
export class MailWorkerModule {}
