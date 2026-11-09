import { FeaturesService } from '../../../core/rbac/features.service.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { addDays, dateInTimeZone, weekEndOf, weekStartOf } from '@pt/domain';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { NotificationsService } from '../../../capabilities/notifications/notifications.service.js';
import { runInTenant, TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { CheckinStateService } from '../checkins/checkin-state.service.js';

const SENDING_HOURS = { from: 9, to: 21 } as const; // local time: no reminders at night

/**
 * Weekly check-in reminders. Clients are reminded on the last day of their check-in week ("due") and, if they
 * missed a week, once in the first three days of the next one ("overdue", which also tells their trainers).
 * Every reminder is recorded once per client and week, so running this as often as needed never sends twice.
 * Uses the unscoped client only to find the organizations with Fitness enabled; the work itself is tenant-scoped.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(CheckinStateService) private readonly state: CheckinStateService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  async run(now: Date = new Date()): Promise<{ due: number; overdue: number; trainerNotices: number }> {
    const total = { due: 0, overdue: 0, trainerNotices: 0 };
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE', modules: { some: { enabled: true, module: { key: 'fitness', status: 'ENABLED' } } } },
      select: { id: true, slug: true, timezone: true, weekStartsOn: true },
    });
    for (const org of orgs) {
      if (!(await this.features.isEnabled('reminders', org.id))) continue;
      try {
        const r = await runInTenant({ orgId: org.id, membershipId: 'system', roleId: 'system', roleKey: 'system', roleRank: 0, grants: {} }, () => this.forOrganization(org, now));
        total.due += r.due; total.overdue += r.overdue; total.trainerNotices += r.trainerNotices;
      } catch (err) {
        this.logger.error(`Reminders failed for organization ${org.id}: ${(err as Error).message}`); // one organization never blocks the others
      }
    }
    return total;
  }

  /** True the first time a reminder key is seen; false when it was already sent. */
  private async markOnce(orgId: string, key: string): Promise<boolean> {
    try {
      await this.tenant.db.fitReminderMark.create({ data: { organizationId: orgId, key } });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return false;
      throw err;
    }
  }

  private async forOrganization(org: { id: string; slug: string; timezone: string; weekStartsOn: number }, now: Date) {
    const result = { due: 0, overdue: 0, trainerNotices: 0 };
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: org.timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
    if (hour < SENDING_HOURS.from || hour >= SENDING_HOURS.to) return result;
    const today = dateInTimeZone(now, org.timezone);
    const weekStart = weekStartOf(today, org.weekStartsOn);
    const lastWeekStart = addDays(weekStart, -7);
    const submitted = (s: string | null) => s === 'SUBMITTED' || s === 'REVIEWED';

    const standings = await this.state.standings(today, org.weekStartsOn);
    const dueIds = [...standings].filter(([, s]) => s.tracked && today === weekEndOf(weekStart) && !submitted(s.thisWeek)).map(([id]) => id);
    const overdueIds = [...standings].filter(([, s]) => s.trackedLastWeek && !submitted(s.lastWeek) && today <= addDays(weekStart, 2)).map(([id]) => id);
    const ids = [...new Set([...dueIds, ...overdueIds])];
    if (ids.length === 0) return result;
    const people = await this.tenant.db.membership.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: { user: { select: { id: true, fullName: true } } } });
    const person = new Map(people.map((p) => [p.id, p]));
    const notify = (userIds: string[], type: string, params: Record<string, string>, data: Record<string, string>) =>
      this.notifications.notify({ userIds, organizationId: org.id, type, params, data: { orgSlug: org.slug, ...data } });

    for (const id of dueIds) {
      const p = person.get(id);
      if (p && (await this.markOnce(org.id, `checkin_due:${id}:${weekStart}`))) { await notify([p.user.id], 'fitness.checkin_due', {}, { checkin: '1' }); result.due += 1; }
    }
    for (const id of overdueIds) {
      const p = person.get(id);
      if (!p) continue;
      if (await this.markOnce(org.id, `checkin_overdue:${id}:${lastWeekStart}`)) { await notify([p.user.id], 'fitness.checkin_overdue', {}, { checkin: '1' }); result.overdue += 1; }
      if (await this.markOnce(org.id, `checkin_overdue_trainer:${id}:${lastWeekStart}`)) {
        const trainers = await this.tenant.db.memberAssignment.findMany({ where: { participantMembershipId: id, endedAt: null }, include: { practitioner: { select: { userId: true } } } });
        if (trainers.length) { await notify(trainers.map((a) => a.practitioner.userId), 'fitness.checkin_overdue_trainer', { client: p.user.fullName }, { clientId: id }); result.trainerNotices += 1; }
      }
    }
    return result;
  }
}

