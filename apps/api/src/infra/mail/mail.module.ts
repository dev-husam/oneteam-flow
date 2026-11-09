import { Module } from '@nestjs/common';
import { EmailQueueService } from './email-queue.service.js';
import { MailService } from './mail.service.js';

/** Producer side: the API enqueues. The consumer lives in MailWorkerModule. */
@Module({
  providers: [MailService, EmailQueueService],
  exports: [MailService, EmailQueueService],
})
export class MailModule {}
