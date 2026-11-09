import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { redisConnectionOptions } from '../redis/redis.module.js';
import { QUEUES } from './queues.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: { ...redisConnectionOptions(config.REDIS_URL), maxRetriesPerRequest: null },
        prefix: config.NODE_ENV === 'test' ? 'bull-test' : 'bull',
      }),
    }),
    BullModule.registerQueue({ name: QUEUES.EMAIL }, { name: QUEUES.PUSH }, { name: QUEUES.MAINTENANCE }, { name: QUEUES.COACHING }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
