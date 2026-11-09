import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { LoggingModule } from './infra/logging/logging.module.js';
import { CoachingRemindersWorkerModule } from './modules/coaching/reminders/session-reminders-worker.module.js';
import { FitnessRemindersWorkerModule } from './modules/fitness/reminders/reminders-worker.module.js';
import { NotificationsModule } from './capabilities/notifications/notifications.module.js';
import { PlatformConfigModule } from './infra/platform-config/platform-config.module.js';
import { FeaturesModule } from './core/rbac/features.module.js';
import { TenancyModule } from './core/tenancy/tenancy.module.js';
import { NotificationsWorkerModule } from './capabilities/notifications/notifications-worker.module.js';
import { MailWorkerModule } from './infra/mail/mail-worker.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { RedisModule } from './infra/redis/redis.module.js';

/** Queue consumers only: no HTTP server. Same code base, separate process. */
@Module({
  imports: [ConfigModule, LoggingModule, FeaturesModule, PlatformConfigModule, PrismaModule, RedisModule, QueueModule, MailWorkerModule, NotificationsWorkerModule, TenancyModule, NotificationsModule, FitnessRemindersWorkerModule, CoachingRemindersWorkerModule],
})
export class WorkerModule {}
