import { Inject, Injectable } from '@nestjs/common';
import { addDays, dateInTimeZone, scheduleIssues, type WeeklySchedule } from '@pt/domain';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import { NotificationsService } from '../../../capabilities/notifications/notifications.service.js';
import { PlansService } from '../plans/plans.service.js';
import { ReachService } from '../reach/reach.service.js';
import type { CreateAssignmentsDto, ListAssignmentsQuery } from './workouts.dto.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const valid = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && ymd(asDate(s)) === s;

/** The organization's clock: "today" and the slug used in notification links. */
export async function orgClock(tenant: TenantPrismaService) {
  const org = await tenant.db.organization.findFirstOrThrow({ select: { slug: true, timezone: true, weekStartsOn: true } });
  return { slug: org.slug, timezone: org.timezone, weekStartsOn: org.weekStartsOn, today: dateInTimeZone(new Date(), org.timezone) };
}

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(ReachService) private readonly reach: ReachService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async create(planId: string, dto: CreateAssignmentsDto) {
    const t = requestContext.tenant();
    const plan = await this.plans.requirePlan(planId);
    if (plan.archivedAt) throw new AppError('PLAN_INVALID', { issues: [{ path: 'planId', rule: 'archived' }] });
    const versionId = dto.versionId ?? plan.currentVersionId;
    const version = versionId ? await this.tenant.db.fitWorkoutPlanVersion.findFirst({ where: { id: versionId, planId }, include: { _count: { select: { days: true } } } }) : null;
    if (!version) throw new AppError(dto.versionId ? 'NOT_FOUND' : 'PLAN_INVALID', dto.versionId ? undefined : { issues: [{ path: 'versionId', rule: 'notPublished' }] });
    if (!version.publishedAt) throw new AppError('PLAN_INVALID', { issues: [{ path: 'versionId', rule: 'notPublished' }] });

    const bad = scheduleIssues(dto.weeklySchedule as WeeklySchedule, version._count.days);
    if (bad.length) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'weeklySchedule', rules: ['isValidSchedule'], days: bad }] });
    const clock = await orgClock(this.tenant);
    const fieldErrors: { field: string; rules: string[] }[] = [];
    if (!valid(dto.startDate) || dto.startDate < clock.today) fieldErrors.push({ field: 'startDate', rules: ['notInPast'] });
    if (dto.endDate && (!valid(dto.endDate) || dto.endDate < dto.startDate || dto.endDate > addDays(dto.startDate, 730))) fieldErrors.push({ field: 'endDate', rules: ['isAfterStart'] });
    if (fieldErrors.length) throw new AppError('VALIDATION_FAILED', { fields: fieldErrors });

    const { ids, skipped } = await this.reach.resolveClients('fitness.workout_plan.assign', dto);
    const batchId = randomUUID();
    const created = await this.tenant.db.$transaction(async (tx) => {
      const rows = [];
      for (const clientMembershipId of ids) {
        const a = await tx.fitWorkoutAssignment.create({
          data: { organizationId: t.orgId, versionId: version.id, clientMembershipId, assignedByMembershipId: t.membershipId, batchId, startDate: asDate(dto.startDate), endDate: dto.endDate ? asDate(dto.endDate) : null, weeklySchedule: dto.weeklySchedule },
        });
        await this.activity.record({ entityType: 'workout_assignment', entityId: a.id, verb: 'fitness.plan_assigned', subjectMembershipId: clientMembershipId, data: { plan: plan.name } }, tx);
        rows.push(a);
      }
      await this.audit.record({ action: 'fitness.plan.assigned', targetType: 'workout_plan', targetId: planId, metadata: { versionId: version.id, versionNo: version.versionNo, clients: ids.length, batchId } }, tx);
      return rows;
    });

    const [actor, people] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.membership.findMany({ where: { id: { in: ids } }, select: { userId: true } }),
    ]);
    await this.notifications.notify({ userIds: people.map((p) => p.userId).filter((u) => u !== actor.userId), organizationId: t.orgId, type: 'fitness.workout_assigned', params: { actor: actor.user.fullName, plan: plan.name }, data: { orgSlug: clock.slug, workouts: '1' } });
    return { batchId, assignments: created.map((a) => ({ id: a.id, clientMembershipId: a.clientMembershipId })), skipped };
  }

  private toDto(a: { id: string; versionId: string; clientMembershipId: string; startDate: Date; endDate: Date | null; weeklySchedule: unknown; status: string; batchId: string | null; createdAt: Date; version: { versionNo: number; plan: { id: string; name: string } }; client: { user: { fullName: string } }; assignedBy: { user: { fullName: string } } }, today: string, completed = 0) {
    const start = ymd(a.startDate);
    const end = a.endDate ? ymd(a.endDate) : null;
    const state = a.status === 'CANCELLED' ? 'CANCELLED' : start > today ? 'UPCOMING' : end !== null && end < today ? 'ENDED' : 'ACTIVE';
    return {
      id: a.id, planId: a.version.plan.id, planName: a.version.plan.name, versionId: a.versionId, versionNo: a.version.versionNo,
      clientMembershipId: a.clientMembershipId, clientName: a.client.user.fullName, assignedByName: a.assignedBy.user.fullName,
      startDate: start, endDate: end, weeklySchedule: a.weeklySchedule as WeeklySchedule, status: a.status, state, batchId: a.batchId, completedSessions: completed, createdAt: a.createdAt,
    };
  }

  private static readonly include = {
    version: { select: { versionNo: true, plan: { select: { id: true, name: true } } } },
    client: { include: { user: { select: { fullName: true } } } },
    assignedBy: { include: { user: { select: { fullName: true } } } },
  } as const;

  async list(q: ListAssignmentsQuery) {
    const limit = pageSize(q);
    const clock = await orgClock(this.tenant);
    const rows = await this.tenant.db.fitWorkoutAssignment.findMany({
      where: { AND: [{ client: await this.authz.memberReadFilter('fitness.workout.read') }, q.clientMembershipId ? { clientMembershipId: q.clientMembershipId } : {}, q.status ? { status: q.status } : {}, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1, include: AssignmentsService.include,
    });
    const page = toPage(rows, limit);
    const ids = page.data.map((r) => r.id);
    const done = ids.length ? await this.tenant.db.fitWorkoutSession.groupBy({ by: ['assignmentId'], where: { assignmentId: { in: ids }, completedAt: { not: null } }, _count: { _all: true } }) : [];
    return { data: page.data.map((a) => this.toDto(a, clock.today, done.find((d) => d.assignmentId === a.id)?._count._all ?? 0)), meta: page.meta };
  }

  /** One assignment with the full plan content it points at and the sessions logged against it. */
  async get(id: string) {
    const clock = await orgClock(this.tenant);
    const a = await this.tenant.db.fitWorkoutAssignment.findFirst({ where: { id, client: await this.authz.memberReadFilter('fitness.workout.read') }, include: AssignmentsService.include });
    if (!a) throw new AppError('NOT_FOUND');
    const [content, sessions] = await Promise.all([
      this.plans.versionContent(a.versionId),
      this.tenant.db.fitWorkoutSession.findMany({ where: { assignmentId: id }, orderBy: { scheduledDate: 'desc' }, take: 30, include: { day: { select: { name: true, dayIndex: true } } } }),
    ]);
    const completed = sessions.filter((s) => s.completedAt).length;
    return {
      ...this.toDto(a, clock.today, completed), content,
      sessions: sessions.map((s) => ({ id: s.id, scheduledDate: ymd(s.scheduledDate), dayId: s.dayId, dayName: s.day.name, completedAt: s.completedAt, rpe: s.rpe })),
    };
  }

  async cancel(id: string): Promise<void> {
    const a = await this.tenant.db.fitWorkoutAssignment.findFirst({ where: { id } });
    if (!a || !(await this.authz.allows('fitness.workout_plan.assign', { subjectMembershipId: a.clientMembershipId }))) throw new AppError('NOT_FOUND');
    if (a.status === 'CANCELLED') return;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitWorkoutAssignment.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record({ action: 'fitness.plan.assignment_cancelled', targetType: 'workout_assignment', targetId: id, metadata: { clientMembershipId: a.clientMembershipId } }, tx);
    });
  }
}
