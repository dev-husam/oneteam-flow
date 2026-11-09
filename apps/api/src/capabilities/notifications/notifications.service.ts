import { FeaturesService } from '../../core/rbac/features.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { cursorWhere, pageSize, toPage, type PageQueryDto } from '../../common/pagination.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_JOB_OPTIONS, QUEUES, type EmailJob, type PushJob } from '../../infra/queue/queues.js';
import { asLocale, renderNotification } from './notification-text.js';

export const NOTIFICATION_CATEGORIES = ['tasks', 'progress', 'fitness', 'messages', 'coaching'] as const;
export const NOTIFICATION_CHANNELS = ['IN_APP', 'PUSH', 'EMAIL'] as const;
type Channel = (typeof NOTIFICATION_CHANNELS)[number];

/** Out of the box: inbox and push on, e-mail off (nobody asked for more e-mail). */
const DEFAULTS: Record<Channel, boolean> = { IN_APP: true, PUSH: true, EMAIL: false };

export const categoryOf = (type: string): string =>
  type.startsWith('task.') ? 'tasks' : type.startsWith('fitness.') ? 'fitness' : type.startsWith('message.') ? 'messages' : type.startsWith('coaching.') ? 'coaching' : 'progress';

export interface NotifyInput {
  userIds: string[];
  organizationId?: string;
  type: string;
  params?: Record<string, string>;
  /** Deep-link data (ids, org slug). Never secrets. */
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.PUSH) private readonly pushQueue: Queue<PushJob>,
    @InjectQueue(QUEUES.EMAIL) private readonly emailQueue: Queue<EmailJob>,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  /**
   * Creates the in-app notification and queues push/e-mail per each recipient's preferences. An organization-level
   * preference overrides the user's default ("all"), which overrides the built-in default.
   */
  async notify(input: NotifyInput): Promise<void> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return;
    const category = categoryOf(input.type);
    const scopes = input.organizationId ? [input.organizationId, 'all'] : ['all'];
    const prefs = await this.prisma.notificationPreference.findMany({ where: { userId: { in: userIds }, category, scopeKey: { in: scopes } } });

    const enabled = (userId: string, channel: Channel): boolean => {
      for (const scope of scopes) {
        const hit = prefs.find((p) => p.userId === userId && p.scopeKey === scope && p.channel === channel);
        if (hit) return hit.enabled;
      }
      return DEFAULTS[channel];
    };

    const inbox = userIds.filter((u) => enabled(u, 'IN_APP'));
    if (inbox.length) {
      await this.prisma.notification.createMany({
        data: inbox.map((userId) => ({ userId, organizationId: input.organizationId, typeKey: input.type, params: input.params as never, data: input.data as never })),
      });
    }
    const job = (userId: string) => ({ userId, type: input.type, params: input.params, data: input.data });
    // Administrators can switch whole channels off, platform-wide or for one organization.
    const [pushOn, emailOn] = await Promise.all([this.features.isEnabled('push_notifications', input.organizationId), this.features.isEnabled('email_notifications', input.organizationId)]);
    for (const userId of userIds) {
      if (pushOn && enabled(userId, 'PUSH')) await this.pushQueue.add('push', job(userId), EMAIL_JOB_OPTIONS);
      if (emailOn && enabled(userId, 'EMAIL')) await this.emailQueue.add('notification', { template: 'notification', ...job(userId) }, EMAIL_JOB_OPTIONS);
    }
  }

  async list(userId: string, locale: string, q: PageQueryDto & { unread?: boolean }) {
    const limit = pageSize(q);
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...cursorWhere(q.cursor, 'desc'), ...(q.unread ? { readAt: null } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = toPage(rows, limit);
    return {
      data: page.data.map((n) => ({
        id: n.id, typeKey: n.typeKey, organizationId: n.organizationId, data: n.data, readAt: n.readAt, createdAt: n.createdAt,
        ...renderNotification(n.typeKey, asLocale(locale), (n.params ?? undefined) as Record<string, string> | undefined),
      })),
      meta: page.meta,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Only the recipient can mark a notification read; anything else is a plain 404. */
  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    const exists = result.count > 0 || (await this.prisma.notification.count({ where: { id, userId } })) > 0;
    if (!exists) throw new AppError('NOT_FOUND');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /** Effective settings for every category × channel, for one organization (or the default scope). */
  async preferences(userId: string, organizationId?: string) {
    const scopes = organizationId ? [organizationId, 'all'] : ['all'];
    const prefs = await this.prisma.notificationPreference.findMany({ where: { userId, scopeKey: { in: scopes } } });
    return NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      channels: Object.fromEntries(
        NOTIFICATION_CHANNELS.map((channel) => {
          const hit = scopes.map((s) => prefs.find((p) => p.scopeKey === s && p.category === category && p.channel === channel)).find(Boolean);
          return [channel, hit ? hit.enabled : DEFAULTS[channel]];
        }),
      ),
    }));
  }

  async setPreference(userId: string, input: { organizationId?: string; category: string; channel: Channel; enabled: boolean }): Promise<void> {
    if (input.organizationId) {
      const member = await this.prisma.membership.findFirst({ where: { userId, organizationId: input.organizationId, status: 'ACTIVE' }, select: { id: true } });
      if (!member) throw new AppError('NOT_FOUND');
    }
    const scopeKey = input.organizationId ?? 'all';
    await this.prisma.notificationPreference.upsert({
      where: { userId_scopeKey_category_channel: { userId, scopeKey, category: input.category, channel: input.channel } },
      create: { userId, scopeKey, category: input.category, channel: input.channel, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
  }
}
