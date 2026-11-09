import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { QUEUES } from '../../../infra/queue/queues.js';
import { CoachingReach } from '../reach.service.js';
import { SessionRemindersService } from './session-reminders.service.js';

const JOB = 'coaching-session-reminders';
const EVERY_MS = 10 * 60_000;

/** Its own queue: two consumers on one queue would each take jobs meant for the other. */
@Processor(QUEUES.COACHING)
export class SessionRemindersProcessor extends WorkerHost {
  constructor(@Inject(SessionRemindersService) private readonly reminders: SessionRemindersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB) await this.reminders.run();
  }
}

/** Registers the repeating job (idempotent). Not in tests, which run the reminders directly. */
@Injectable()
export class SessionRemindersScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.COACHING) private readonly queue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    await this.queue.upsertJobScheduler(JOB, { every: EVERY_MS }, { name: JOB, opts: { removeOnComplete: true, removeOnFail: { age: 3_600 } } });
  }
}

@Module({ providers: [CoachingReach, SessionRemindersService, SessionRemindersProcessor, SessionRemindersScheduler] })
export class CoachingRemindersWorkerModule {}
