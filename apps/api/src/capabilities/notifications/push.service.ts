import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** In-process outbox for PUSH_TRANSPORT=memory (tests). */
export const memoryPushOutbox: PushMessage[] = [];

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0 || this.config.PUSH_TRANSPORT === 'off') return;
    if (this.config.PUSH_TRANSPORT === 'memory') {
      memoryPushOutbox.push(...messages);
      return;
    }
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
      });
      if (!res.ok) throw new Error(`Expo push failed: ${res.status}`); // the queue retries with backoff
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      // A token the OS no longer knows must stop receiving pushes.
      const dead = batch.filter((_, idx) => json.data?.[idx]?.details?.error === 'DeviceNotRegistered').map((m) => m.to);
      if (dead.length) {
        await this.prisma.pushDevice.updateMany({ where: { expoPushToken: { in: dead } }, data: { revokedAt: new Date() } });
        this.logger.warn({ count: dead.length }, 'Revoked unregistered push tokens');
      }
    }
  }
}
