import { Inject, Injectable, Logger } from '@nestjs/common';
import { sessionReminderDue } from '@pt/domain';
import { FeaturesService } from '../../../core/rbac/features.service.js';
import { runInTenant } from '../../../core/tenancy/tenant-prisma.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { CoachingReach } from '../reach.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';

/**
 * Reminds both people about a planned session: once on the day before (inside 24 hours) and once shortly before it
 * starts (inside 2 hours). Each is recorded on the session, so running this as often as needed never sends twice.
 * The unscoped client only finds the organizations that use Coaching; the work itself is tenant-scoped.
 */
@Injectable()
export class SessionRemindersService {
  private readonly logger = new Logger(SessionRemindersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(CoachingReach) private readonly reach: CoachingReach,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  async run(now: Date = new Date()): Promise<{ day: number; soon: number }> {
    const total = { day: 0, soon: 0 };
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE', modules: { some: { enabled: true, module: { key: 'coaching', status: 'ENABLED' } } } },
      select: { id: true },
    });
    for (const org of orgs) {
      if (!(await this.features.isEnabled('reminders', org.id))) continue;
      try {
        const r = await runInTenant({ orgId: org.id, membershipId: 'system', roleId: 'system', roleKey: 'system', roleRank: 0, grants: {} }, () => this.forOrganization(now));
        total.day += r.day; total.soon += r.soon;
      } catch (err) {
        this.logger.error(`Session reminders failed for organization ${org.id}: ${(err as Error).message}`); // one organization never blocks the others
      }
    }
    return total;
  }

  private async forOrganization(now: Date): Promise<{ day: number; soon: number }> {
    const result = { day: 0, soon: 0 };
    const sessions = await this.tenant.db.coachSession.findMany({
      where: { status: 'PLANNED', startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) } },
      include: { coach: { select: { user: { select: { fullName: true } } } }, client: { select: { user: { select: { fullName: true } } } } },
    });
    for (const s of sessions) {
      const due = sessionReminderDue(now, s.startsAt, { day: s.reminderDaySentAt !== null, soon: s.reminderSoonSentAt !== null });
      if (!due) continue;
      // Claim the reminder first: a second worker that raced us finds nothing to update and sends nothing.
      const claimed = await this.tenant.db.coachSession.updateMany({
        where: { id: s.id, status: 'PLANNED', ...(due === 'day' ? { reminderDaySentAt: null } : { reminderSoonSentAt: null }) },
        data: due === 'day' ? { reminderDaySentAt: now } : { reminderSoonSentAt: now, reminderDaySentAt: s.reminderDaySentAt ?? now },
      });
      if (claimed.count !== 1) continue;
      const type = due === 'day' ? 'coaching.session_reminder_day' : 'coaching.session_reminder_soon';
      await this.reach.notify([s.clientMembershipId], type, { when: s.startsAt, params: { name: s.coach.user.fullName }, audience: 'client' });
      await this.reach.notify([s.coachMembershipId], type, { when: s.startsAt, params: { name: s.client.user.fullName }, clientId: s.clientMembershipId, audience: 'coach' });
      result[due] += 1;
    }
    return result;
  }
}
