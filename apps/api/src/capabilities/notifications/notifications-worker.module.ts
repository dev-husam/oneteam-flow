import { Module } from '@nestjs/common';
import { PushProcessor } from './notifications.processor.js';
import { PushService } from './push.service.js';

/** Consumer side (worker process, or APP_ROLE=all). */
@Module({ providers: [PushProcessor, PushService] })
export class NotificationsWorkerModule {}
