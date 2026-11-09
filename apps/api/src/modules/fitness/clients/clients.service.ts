import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { SecretBox } from '../../../common/util/secret-box.js';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ProgressService } from '../../../capabilities/progress/progress.service.js';
import { CheckinStateService } from '../checkins/checkin-state.service.js';
import { orgClock } from '../workouts/assignments.service.js';
import type { ListClientsQuery, UpdateClientProfileDto } from './clients.dto.js';

const MIN_AGE_YEARS = 18; // decision Q7: no minors in the Fitness MVP
const ymd = (d: Date): string => (Number.isNaN(d.getTime()) ? 'invalid' : d.toISOString().slice(0, 10));
const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

function ageOn(dob: string, now: Date): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

@Injectable()
export class ClientsService {
  private readonly box: SecretBox;

  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ProgressService) private readonly progress: ProgressService,
    @Inject(CheckinStateService) private readonly checkinState: CheckinStateService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.box = new SecretBox(config.MFA_ENCRYPTION_KEY);
  }

  /** A client is a member in the participant role, or anyone who already has a Fitness profile or workout assignment. */
  private static readonly IS_CLIENT = { OR: [{ role: { key: 'participant' } }, { fitProfile: { isNot: null } }, { fitAssignmentsAsClient: { some: {} } }] };

  private profileDto(p: { dateOfBirth: Date | null; sex: string | null; heightCm: unknown; goalType: string | null; goalsText: string | null; activityLevel: string | null; injuriesNotesEnc: string | null; updatedAt: Date } | null) {
    if (!p) return null;
    return {
      dateOfBirth: p.dateOfBirth ? ymd(p.dateOfBirth) : null, sex: p.sex, heightCm: num(p.heightCm as never), goalType: p.goalType, goalsText: p.goalsText,
      activityLevel: p.activityLevel, injuriesNotes: p.injuriesNotesEnc ? this.box.decrypt(p.injuriesNotesEnc) : null, updatedAt: p.updatedAt,
    };
  }

  async list(q: ListClientsQuery) {
    const limit = pageSize(q);
    const rows = await this.tenant.db.membership.findMany({
      where: {
        AND: [
          { status: 'ACTIVE' }, await this.authz.memberReadFilter('fitness.client.read'), ClientsService.IS_CLIENT,
          q.q ? { user: { OR: [{ fullName: { contains: q.q } }, { email: { contains: q.q } }] } } : {},
          cursorWhere(q.cursor, 'asc'),
        ],
      },
      orderBy: { id: 'asc' }, take: limit + 1,
      include: { user: { select: { fullName: true, email: true } }, fitProfile: { select: { goalType: true, heightCm: true } } },
    });
    const page = toPage(rows, limit);
    const ids = page.data.map((m) => m.id);
    const clock = await orgClock(this.tenant);
    const standings = await this.checkinState.standings(clock.today, clock.weekStartsOn, ids);
    const [assignments, lastSessions] = ids.length
      ? await Promise.all([
          this.tenant.db.fitWorkoutAssignment.findMany({ where: { clientMembershipId: { in: ids }, status: 'ACTIVE' }, include: { version: { select: { plan: { select: { id: true, name: true } } } } } }),
          this.tenant.db.fitWorkoutSession.groupBy({ by: ['clientMembershipId'], where: { clientMembershipId: { in: ids }, completedAt: { not: null } }, _max: { completedAt: true } }),
        ])
      : [[], []];
    return {
      data: page.data.map((m) => ({
        membershipId: m.id, fullName: m.user.fullName, email: m.user.email, goalType: m.fitProfile?.goalType ?? null, heightCm: num(m.fitProfile?.heightCm),
        activePlans: assignments.filter((a) => a.clientMembershipId === m.id).map((a) => ({ assignmentId: a.id, planId: a.version.plan.id, planName: a.version.plan.name })),
        lastSessionAt: lastSessions.find((s) => s.clientMembershipId === m.id)?._max.completedAt ?? null,
        checkin: this.checkinState.dueState(standings.get(m.id), clock.today, clock.weekStartsOn),
      })),
      meta: page.meta,
    };
  }

  /** The member must be a client the caller may read under `code`; anything else is a plain 404. */
  private async requireClient(code: string, membershipId: string) {
    const m = await this.tenant.db.membership.findFirst({ where: { id: membershipId, status: 'ACTIVE' }, include: { user: { select: { fullName: true, email: true } }, fitProfile: true } });
    if (!m || !(await this.authz.allows(code, { subjectMembershipId: membershipId }))) throw new AppError('NOT_FOUND');
    return m;
  }

  async get(membershipId: string) {
    const m = await this.requireClient('fitness.client.read', membershipId);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [completed30d, last, assignments, start] = await Promise.all([
      this.tenant.db.fitWorkoutSession.count({ where: { clientMembershipId: membershipId, completedAt: { gte: since } } }),
      this.tenant.db.fitWorkoutSession.findFirst({ where: { clientMembershipId: membershipId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } }),
      this.tenant.db.fitWorkoutAssignment.findMany({ where: { clientMembershipId: membershipId, status: 'ACTIVE' }, include: { version: { select: { versionNo: true, plan: { select: { id: true, name: true } } } } }, orderBy: { id: 'desc' } }),
      this.tenant.db.metricRecord.findFirst({ where: { subjectMembershipId: membershipId, sourceType: 'fit.onboarding', voidedAt: null }, orderBy: { recordedAt: 'asc' }, select: { value: true } }),
    ]);
    return {
      membershipId: m.id, fullName: m.user.fullName, email: m.user.email, profile: this.profileDto(m.fitProfile), startingWeightKg: num(start?.value),
      stats: { completedLast30Days: completed30d, lastSessionAt: last?.completedAt ?? null },
      activePlans: assignments.map((a) => ({ assignmentId: a.id, planId: a.version.plan.id, planName: a.version.plan.name, versionNo: a.version.versionNo, startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null })),
    };
  }

  async updateProfile(membershipId: string, dto: UpdateClientProfileDto) {
    await this.requireClient('fitness.client.update', membershipId);
    const t = requestContext.tenant();
    if (dto.dateOfBirth) {
      const age = ageOn(dto.dateOfBirth, new Date());
      // Date.parse is lenient ("1990-02-31" becomes March 3rd): only accept a date that survives a round trip.
      const real = ymd(new Date(`${dto.dateOfBirth}T00:00:00Z`)) === dto.dateOfBirth;
      if (!real || age < MIN_AGE_YEARS || age > 120) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'dateOfBirth', rules: [!real ? 'isValid' : age < MIN_AGE_YEARS ? 'minAge' : 'isValid'] }] });
    }
    if (dto.startingWeightKg !== undefined && !(await this.authz.allows('progress.record', { subjectMembershipId: membershipId }))) throw new AppError('FORBIDDEN');

    const data = {
      dateOfBirth: dto.dateOfBirth === undefined ? undefined : dto.dateOfBirth === null ? null : new Date(`${dto.dateOfBirth}T00:00:00Z`),
      sex: dto.sex, heightCm: dto.heightCm, goalType: dto.goalType, goalsText: dto.goalsText, activityLevel: dto.activityLevel,
      injuriesNotesEnc: dto.injuriesNotes === undefined ? undefined : dto.injuriesNotes ? this.box.encrypt(dto.injuriesNotes) : null,
    };
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitClientProfile.upsert({
        where: { organizationId_membershipId: { organizationId: t.orgId, membershipId } },
        create: { organizationId: t.orgId, membershipId, ...data },
        update: data,
      });
      // Field names only: health notes and values never go to the audit log.
      await this.audit.record({ action: 'fitness.client_profile.updated', targetType: 'membership', targetId: membershipId, metadata: { fields: Object.keys(dto) } }, tx);
    });
    if (dto.startingWeightKg !== undefined) {
      const already = await this.tenant.db.metricRecord.findFirst({ where: { subjectMembershipId: membershipId, sourceType: 'fit.onboarding', voidedAt: null }, select: { id: true } });
      if (!already) await this.progress.recordByKey(membershipId, 'weight_kg', dto.startingWeightKg, { type: 'fit.onboarding' });
    }
    return this.get(membershipId);
  }
}
