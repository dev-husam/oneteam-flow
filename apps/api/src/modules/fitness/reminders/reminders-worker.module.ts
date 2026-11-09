import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { QUEUES } from '../../../infra/queue/queues.js';
import { RemindersModule } from './reminders.module.js';
import { RemindersService } from './reminders.service.js';

const JOB = 'fitness-reminders';
const EVERY_MS = 15 * 60_000;

@Processor(QUEUES.MAINTENANCE)
export class RemindersProcessor extends WorkerHost {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB) await this.reminders.run();
  }
}

/** Registers the repeating job (idempotent: the same scheduler id is updated, never duplicated). Not in tests, which run reminders directly. */
@Injectable()
export class RemindersScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.MAINTENANCE) private readonly queue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    await this.queue.upsertJobScheduler(JOB, { every: EVERY_MS }, { name: JOB, opts: { removeOnComplete: true, removeOnFail: { age: 3_600 } } });
  }
}

/** Consumer side (worker process, or APP_ROLE=all). */
@Module({ imports: [RemindersModule], providers: [RemindersProcessor, RemindersScheduler] })
export class FitnessRemindersWorkerModule {}
