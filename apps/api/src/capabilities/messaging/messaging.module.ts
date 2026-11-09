import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module.js';
import { FilesModule } from '../files/files.module.js';
import { MessageFileAccess } from './message-file-access.js';
import { MessageReportsController, MessagingController } from './messaging.controller.js';
import { ModerationService } from './moderation.service.js';
import { MessagingService } from './messaging.service.js';
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { RealtimeService } from './realtime/realtime.service.js';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MessagingController, MessageReportsController],
  providers: [MessagingService, ModerationService, MessageFileAccess, RealtimeService, RealtimeGateway],
  exports: [MessagingService, RealtimeService],
})
export class MessagingModule {}
