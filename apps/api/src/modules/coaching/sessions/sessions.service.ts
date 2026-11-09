import { Inject, Injectable } from '@nestjs/common';
import type { CoachSessionStatus } from '../../../generated/prisma/enums.js';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { CoachingReach, userName } from '../reach.service.js';
import type { CancelSessionDto, CreateSessionDto, ListSessionsQuery, UpdateSessionDto } from './sessions.dto.js';

const include = { coach: { select: userName }, client: { select: userName } } as const;
type Row = { id: string; coachMembershipId: string; clientMembershipId: string; startsAt: Date; durationMinutes: number; location: string | null; agenda: string | null; status: CoachSessionStatus; cancelReason: string | null; createdAt: Date; coach: { user: { fullName: string } }; client: { user: { fullName: string } } };

const toDto = (s: Row) => ({
  id: s.id, coachMembershipId: s.coachMembershipId, coachName: s.coach.user.fullName, clientMembershipId: s.clientMembershipId, clientName: s.client.user.fullName,
  startsAt: s.startsAt, durationMinutes: s.durationMinutes, location: s.location, agenda: s.agenda, status: s.status, cancelReason: s.cancelReason, createdAt: s.createdAt,
});

const SLACK_MS = 5 * 60_000;
const MAX_AHEAD_MS = 2 * 365 * 86_400_000;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoachingReach) private readonly reach: CoachingReach,
  ) {}

  async list(q: ListSessionsQuery) {
    const scope = await this.reach.clientFilter('coaching.session.read');
    const rows = await this.tenant.db.coachSession.findMany({
      where: {
        ...scope,
        ...(q.clientMembershipId ? { clientMembershipId: scope.clientMembershipId ? { in: scope.clientMembershipId.in.filter((i) => i === q.clientMembershipId) } : q.clientMembershipId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { startsAt: q.order === 'desc' ? 'desc' : 'asc' },
      take: 200,
      include,
    });
    return rows.map(toDto);
  }

  private async load(id: string, code: string) {
    const s = await this.tenant.db.coachSession.findFirst({ where: { id }, include });
    if (!s || !(await this.authz.allows(code, { subjectMembershipId: s.clientMembershipId, ownerMembershipId: code.endsWith('manage') ? s.coachMembershipId : undefined }))) throw new AppError('NOT_FOUND');
    return s;
  }

  async get(id: string) {
    return toDto(await this.load(id, 'coaching.session.read'));
  }

  private assertTime(startsAt: Date, durationOk = true) {
    if (Number.isNaN(startsAt.getTime())) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'startsAt', rules: ['isISO8601'] }] });
    if (startsAt.getTime() < Date.now() - SLACK_MS) throw new AppError('SESSION_IN_PAST');
    if (startsAt.getTime() > Date.now() + MAX_AHEAD_MS) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'startsAt', rules: ['tooFarAhead'] }] });
    void durationOk;
  }

  async create(dto: CreateSessionDto) {
    const t = requestContext.tenant();
    const client = await this.reach.requireClient('coaching.session.manage', dto.clientMembershipId);
    const startsAt = new Date(dto.startsAt);
    this.assertTime(startsAt);
    const created = await this.tenant.db.$transaction(async (tx) => {
      const s = await tx.coachSession.create({
        data: { organizationId: t.orgId, coachMembershipId: t.membershipId, clientMembershipId: client.id, startsAt, durationMinutes: dto.durationMinutes, location: dto.location?.trim() || null, agenda: dto.agenda?.trim() || null },
        include,
      });
      await this.audit.record({ action: 'coaching.session_created', targetType: 'coach_session', targetId: s.id, metadata: { clientMembershipId: client.id } }, tx);
      return s;
    });
    await this.reach.notify([client.id], 'coaching.session_scheduled', { when: startsAt, params: { name: created.coach.user.fullName }, audience: 'client' });
    return toDto(created);
  }

  async update(id: string, dto: UpdateSessionDto) {
    const s = await this.load(id, 'coaching.session.manage');
    if (s.status !== 'PLANNED') throw new AppError('SESSION_NOT_PLANNED');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const moved = startsAt !== undefined && startsAt.getTime() !== s.startsAt.getTime();
    if (startsAt && moved) this.assertTime(startsAt);
    const updated = await this.tenant.db.$transaction(async (tx) => {
      const row = await tx.coachSession.update({
        where: { id },
        data: {
          ...(startsAt ? { startsAt } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.location !== undefined ? { location: dto.location.trim() || null } : {}),
          ...(dto.agenda !== undefined ? { agenda: dto.agenda.trim() || null } : {}),
          // A new time means the reminders start over.
          ...(moved ? { reminderDaySentAt: null, reminderSoonSentAt: null } : {}),
        },
        include,
      });
      await this.audit.record({ action: 'coaching.session_updated', targetType: 'coach_session', targetId: id, metadata: { fields: Object.keys(dto), moved } }, tx);
      return row;
    });
    await this.reach.notify([s.clientMembershipId], 'coaching.session_changed', { when: updated.startsAt, params: { name: updated.coach.user.fullName }, audience: 'client' });
    return toDto(updated);
  }

  async cancel(id: string, dto: CancelSessionDto) {
    const s = await this.load(id, 'coaching.session.manage');
    if (s.status !== 'PLANNED') throw new AppError('SESSION_NOT_PLANNED');
    const updated = await this.tenant.db.$transaction(async (tx) => {
      const row = await tx.coachSession.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: dto.reason?.trim() || null }, include });
      await this.audit.record({ action: 'coaching.session_cancelled', targetType: 'coach_session', targetId: id }, tx);
      return row;
    });
    await this.reach.notify([s.clientMembershipId], 'coaching.session_cancelled', { when: s.startsAt, params: { name: updated.coach.user.fullName }, audience: 'client' });
    return toDto(updated);
  }

  /** Mark a session as held once it has started. */
  async complete(id: string) {
    const s = await this.load(id, 'coaching.session.manage');
    if (s.status !== 'PLANNED') throw new AppError('SESSION_NOT_PLANNED');
    if (s.startsAt.getTime() > Date.now()) throw new AppError('SESSION_NOT_STARTED');
    const updated = await this.tenant.db.$transaction(async (tx) => {
      const row = await tx.coachSession.update({ where: { id }, data: { status: 'HELD' }, include });
      await this.audit.record({ action: 'coaching.session_held', targetType: 'coach_session', targetId: id }, tx);
      return row;
    });
    return toDto(updated);
  }
}
