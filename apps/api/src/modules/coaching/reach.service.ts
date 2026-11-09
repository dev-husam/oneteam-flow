import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { NotificationsService } from '../../capabilities/notifications/notifications.service.js';
import { AuthorizationService } from '../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';

export const userName = { user: { select: { fullName: true } } } as const;

/** Who a coach may act on, and how coaching notifications are addressed. Shared by sessions, notes, assessments and resources. */
@Injectable()
export class CoachingReach {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Prisma fragment that limits rows about a client to the clients the caller may see under `code`, applied inside the query. */
  async clientFilter(code: string): Promise<{ clientMembershipId?: { in: string[] } }> {
    const f = await this.authz.memberReadFilter(code);
    return f.id ? { clientMembershipId: f.id } : {};
  }

  /** An active client the caller may act on under `code`; anyone else is "not found", never "not allowed". */
  async requireClient(code: string, clientMembershipId: string): Promise<{ id: string; fullName: string }> {
    const m = await this.tenant.db.membership.findFirst({
      where: { id: clientMembershipId, status: 'ACTIVE', role: { key: 'participant', organizationId: null } },
      select: { id: true, ...userName },
    });
    if (!m || !(await this.authz.allows(code, { subjectMembershipId: m.id }))) throw new AppError('NOT_FOUND');
    return { id: m.id, fullName: m.user.fullName };
  }

  /** Coaches assigned to a client (their membership ids). */
  async coachesOf(clientMembershipId: string): Promise<string[]> {
    const rows = await this.tenant.db.memberAssignment.findMany({ where: { participantMembershipId: clientMembershipId, endedAt: null }, select: { practitionerMembershipId: true } });
    return rows.map((r) => r.practitionerMembershipId);
  }

  /**
   * Notifies people in the language of each. `when` (a date) is written in the organization’s time zone and the
   * recipient’s language, so one event can read differently for an Arabic and an English speaker.
   */
  async notify(membershipIds: string[], type: string, opts: { params?: Record<string, string>; when?: Date; clientId?: string; audience: 'coach' | 'client' }): Promise<void> {
    if (membershipIds.length === 0) return;
    const t = requestContext.tenant();
    const [org, people] = await Promise.all([
      this.tenant.db.organization.findFirstOrThrow({ select: { slug: true, timezone: true } }),
      this.tenant.db.membership.findMany({ where: { id: { in: [...new Set(membershipIds)] }, status: 'ACTIVE' }, select: { user: { select: { id: true, locale: true } } } }),
    ]);
    const byLocale = new Map<'en' | 'ar', string[]>();
    for (const p of people) {
      const locale = p.user.locale === 'ar' ? 'ar' : 'en';
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), p.user.id]);
    }
    const data: Record<string, string> = { orgSlug: org.slug, coaching: opts.audience, ...(opts.clientId ? { coachClientId: opts.clientId } : {}) };
    for (const [locale, userIds] of byLocale) {
      const when = opts.when ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: org.timezone }).format(opts.when) : undefined;
      await this.notifications.notify({ userIds, organizationId: t.orgId, type, params: { ...opts.params, ...(when ? { when } : {}) }, data });
    }
  }
}
