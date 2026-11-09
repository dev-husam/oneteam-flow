import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EMAIL_JOB_OPTIONS, QUEUES, type EmailJob } from '../queue/queues.js';

@Injectable()
export class EmailQueueService {
  constructor(@InjectQueue(QUEUES.EMAIL) private readonly queue: Queue<EmailJob>) {}

  async enqueue(job: EmailJob): Promise<void> {
    await this.queue.add(job.template, job, EMAIL_JOB_OPTIONS);
  }
}
