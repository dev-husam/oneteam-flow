import { Inject, Injectable } from '@nestjs/common';
import { addDays } from '@pt/domain';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import { NotificationsService } from '../../../capabilities/notifications/notifications.service.js';
import { ReachService } from '../reach/reach.service.js';
import { orgClock } from '../workouts/assignments.service.js';
import { NutritionPlansService } from './nutrition-plans.service.js';
import type { CreateNutritionAssignmentsDto, ListNutritionAssignmentsQuery } from './nutrition.dto.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const valid = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && ymd(asDate(s)) === s;

@Injectable()
export class NutritionAssignmentsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(NutritionPlansService) private readonly plans: NutritionPlansService,
    @Inject(ReachService) private readonly reach: ReachService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async create(planId: string, dto: CreateNutritionAssignmentsDto) {
    const t = requestContext.tenant();
    const plan = await this.plans.requirePlan(planId);
    if (plan.archivedAt) throw new AppError('PLAN_INVALID', { issues: [{ path: 'planId', rule: 'archived' }] });
    const versionId = dto.versionId ?? plan.currentVersionId;
    const version = versionId ? await this.tenant.db.fitNutritionPlanVersion.findFirst({ where: { id: versionId, planId } }) : null;
    if (!version) throw new AppError(dto.versionId ? 'NOT_FOUND' : 'PLAN_INVALID', dto.versionId ? undefined : { issues: [{ path: 'versionId', rule: 'notPublished' }] });
    if (!version.publishedAt) throw new AppError('PLAN_INVALID', { issues: [{ path: 'versionId', rule: 'notPublished' }] });

    const clock = await orgClock(this.tenant);
    const fields: { field: string; rules: string[] }[] = [];
    if (!valid(dto.startDate) || dto.startDate < clock.today) fields.push({ field: 'startDate', rules: ['notInPast'] });
    if (dto.endDate && (!valid(dto.endDate) || dto.endDate < dto.startDate || dto.endDate > addDays(dto.startDate, 730))) fields.push({ field: 'endDate', rules: ['isAfterStart'] });
    if (fields.length) throw new AppError('VALIDATION_FAILED', { fields });

    const { ids, skipped } = await this.reach.resolveClients('fitness.nutrition_plan.assign', dto);
    const batchId = randomUUID();
    const created = await this.tenant.db.$transaction(async (tx) => {
      const rows = [];
      for (const clientMembershipId of ids) {
        const a = await tx.fitNutritionAssignment.create({ data: { organizationId: t.orgId, versionId: version.id, clientMembershipId, assignedByMembershipId: t.membershipId, batchId, startDate: asDate(dto.startDate), endDate: dto.endDate ? asDate(dto.endDate) : null } });
        await this.activity.record({ entityType: 'nutrition_assignment', entityId: a.id, verb: 'fitness.nutrition_plan_assigned', subjectMembershipId: clientMembershipId, data: { plan: plan.name } }, tx);
        rows.push(a);
      }
      await this.audit.record({ action: 'fitness.nutrition_plan.assigned', targetType: 'nutrition_plan', targetId: planId, metadata: { versionId: version.id, versionNo: version.versionNo, clients: ids.length, batchId } }, tx);
      return rows;
    });
    const [actor, people] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.membership.findMany({ where: { id: { in: ids } }, select: { userId: true } }),
    ]);
    await this.notifications.notify({ userIds: people.map((p) => p.userId).filter((u) => u !== actor.userId), organizationId: t.orgId, type: 'fitness.nutrition_assigned', params: { actor: actor.user.fullName, plan: plan.name }, data: { orgSlug: clock.slug, nutrition: '1' } });
    return { batchId, assignments: created.map((a) => ({ id: a.id, clientMembershipId: a.clientMembershipId })), skipped };
  }

  private static readonly include = {
    version: { select: { versionNo: true, plan: { select: { id: true, name: true } } } },
    client: { include: { user: { select: { fullName: true } } } },
    assignedBy: { include: { user: { select: { fullName: true } } } },
  } as const;

  private toDto(a: { id: string; versionId: string; clientMembershipId: string; startDate: Date; endDate: Date | null; status: string; batchId: string | null; createdAt: Date; version: { versionNo: number; plan: { id: string; name: string } }; client: { user: { fullName: string } }; assignedBy: { user: { fullName: string } } }, today: string) {
    const start = ymd(a.startDate);
    const end = a.endDate ? ymd(a.endDate) : null;
    const state = a.status === 'CANCELLED' ? 'CANCELLED' : start > today ? 'UPCOMING' : end !== null && end < today ? 'ENDED' : 'ACTIVE';
    return { id: a.id, planId: a.version.plan.id, planName: a.version.plan.name, versionId: a.versionId, versionNo: a.version.versionNo, clientMembershipId: a.clientMembershipId, clientName: a.client.user.fullName, assignedByName: a.assignedBy.user.fullName, startDate: start, endDate: end, status: a.status, state, batchId: a.batchId, createdAt: a.createdAt };
  }

  async list(q: ListNutritionAssignmentsQuery) {
    const limit = pageSize(q);
    const clock = await orgClock(this.tenant);
    const rows = await this.tenant.db.fitNutritionAssignment.findMany({
      where: { AND: [{ client: await this.authz.memberReadFilter('fitness.nutrition.read') }, q.clientMembershipId ? { clientMembershipId: q.clientMembershipId } : {}, q.status ? { status: q.status } : {}, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1, include: NutritionAssignmentsService.include,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((a) => this.toDto(a, clock.today)), meta: page.meta };
  }

  async get(id: string) {
    const clock = await orgClock(this.tenant);
    const a = await this.tenant.db.fitNutritionAssignment.findFirst({ where: { id, client: await this.authz.memberReadFilter('fitness.nutrition.read') }, include: NutritionAssignmentsService.include });
    if (!a) throw new AppError('NOT_FOUND');
    return { ...this.toDto(a, clock.today), content: await this.plans.versionContent(a.versionId) };
  }

  async cancel(id: string): Promise<void> {
    const a = await this.tenant.db.fitNutritionAssignment.findFirst({ where: { id } });
    if (!a || !(await this.authz.allows('fitness.nutrition_plan.assign', { subjectMembershipId: a.clientMembershipId }))) throw new AppError('NOT_FOUND');
    if (a.status === 'CANCELLED') return;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitNutritionAssignment.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record({ action: 'fitness.nutrition_plan.assignment_cancelled', targetType: 'nutrition_assignment', targetId: id, metadata: { clientMembershipId: a.clientMembershipId } }, tx);
    });
  }
}
