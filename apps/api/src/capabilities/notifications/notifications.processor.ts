import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { QUEUES, type PushJob } from '../../infra/queue/queues.js';
import { asLocale, renderNotification } from './notification-text.js';
import { PushService } from './push.service.js';

/** Sends one notification to every active device of the user, each in the device's own language. */
@Processor(QUEUES.PUSH)
export class PushProcessor extends WorkerHost {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PushService) private readonly push: PushService,
  ) {
    super();
  }

  async process(job: Job<PushJob>): Promise<void> {
    const devices = await this.prisma.pushDevice.findMany({ where: { userId: job.data.userId, revokedAt: null } });
    await this.push.send(
      devices.map((d) => ({ to: d.expoPushToken, ...renderNotification(job.data.type, asLocale(d.locale), job.data.params), data: job.data.data })),
    );
  }
}
