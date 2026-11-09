import { Inject, Injectable } from '@nestjs/common';
import { validatePlanContent, type PlanDayInput } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import { ExercisesService } from '../exercises/exercises.service.js';
import type { CreatePlanDto, ListPlansQuery, PlanContentDto, UpdatePlanDto } from './plans.dto.js';

const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

const versionInclude = {
  days: { orderBy: { dayIndex: 'asc' as const }, include: { exercises: { orderBy: { position: 'asc' as const }, include: { exercise: true } } } },
};

@Injectable()
export class PlansService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(ExercisesService) private readonly exercises: ExercisesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  /** Plans the caller may manage: all of them with ORG scope, only their own with OWN. */
  private manageScope() {
    const t = requestContext.tenant();
    switch (t.grants['fitness.workout_plan.manage']) {
      case 'ORG':
      case 'ALL':
        return {};
      case 'OWN':
        return { createdByMembershipId: t.membershipId };
      default:
        return { id: { in: [] as string[] } };
    }
  }

  /** A plan the caller may manage, or 404. */
  async requirePlan(planId: string) {
    const plan = await this.tenant.db.fitWorkoutPlan.findFirst({ where: { id: planId, ...this.manageScope() } });
    if (!plan) throw new AppError('NOT_FOUND');
    return plan;
  }

  private async requireVersion(planId: string, versionId: string) {
    await this.requirePlan(planId);
    const version = await this.tenant.db.fitWorkoutPlanVersion.findFirst({ where: { id: versionId, planId } });
    if (!version) throw new AppError('NOT_FOUND');
    return version;
  }

  // ------------------------------------------------------------------ mapping

  private versionDto(v: { id: string; planId: string; versionNo: number; publishedAt: Date | null; notes: string | null; days: { id: string; dayIndex: number; name: string; notes: string | null; exercises: Array<Record<string, unknown> & { id: string; position: number; exerciseId: string; sets: number; repsMin: number; repsMax: number; targetWeightKg: unknown; restSeconds: number; tempo: string | null; supersetGroup: number | null; notes: string | null; exercise: Parameters<typeof ExercisesService.toDto>[0] }> }[] }) {
    return {
      id: v.id, planId: v.planId, versionNo: v.versionNo, publishedAt: v.publishedAt, notes: v.notes, published: v.publishedAt !== null,
      days: v.days.map((d) => ({
        id: d.id, dayIndex: d.dayIndex, name: d.name, notes: d.notes,
        exercises: d.exercises.map((e) => ({
          id: e.id, position: e.position, exerciseId: e.exerciseId, exercise: ExercisesService.toDto(e.exercise), sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax,
          targetWeightKg: num(e.targetWeightKg as never), restSeconds: e.restSeconds, tempo: e.tempo, supersetGroup: e.supersetGroup, notes: e.notes,
        })),
      })),
    };
  }

  /** Shared with assignments: a version's full content. */
  async versionContent(versionId: string) {
    const v = await this.tenant.db.fitWorkoutPlanVersion.findFirst({ where: { id: versionId }, include: versionInclude });
    if (!v) throw new AppError('NOT_FOUND');
    return this.versionDto(v as never);
  }

  private async planDto(planId: string) {
    const plan = await this.tenant.db.fitWorkoutPlan.findFirstOrThrow({
      where: { id: planId },
      include: {
        createdBy: { include: { user: { select: { fullName: true } } } },
        versions: { orderBy: { versionNo: 'asc' }, include: { _count: { select: { days: true, assignments: true } } } },
      },
    });
    const draft = plan.versions.find((v) => v.publishedAt === null);
    const current = plan.versions.find((v) => v.id === plan.currentVersionId) ?? null;
    return {
      id: plan.id, name: plan.name, description: plan.description, archived: plan.archivedAt !== null, createdByMembershipId: plan.createdByMembershipId,
      createdByName: plan.createdBy.user.fullName, createdAt: plan.createdAt, updatedAt: plan.updatedAt,
      currentVersion: current ? { id: current.id, versionNo: current.versionNo, publishedAt: current.publishedAt, dayCount: current._count.days } : null,
      draftVersionId: draft?.id ?? null,
      versions: plan.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, publishedAt: v.publishedAt, notes: v.notes, dayCount: v._count.days, assignmentCount: v._count.assignments })),
    };
  }

  // ------------------------------------------------------------------ plans

  async list(q: ListPlansQuery) {
    const limit = pageSize(q);
    const rows = await this.tenant.db.fitWorkoutPlan.findMany({
      where: { AND: [this.manageScope(), q.archived ? { archivedAt: { not: null } } : { archivedAt: null }, q.q ? { name: { contains: q.q } } : {}, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1,
      include: {
        createdBy: { include: { user: { select: { fullName: true } } } },
        versions: { orderBy: { versionNo: 'asc' }, select: { id: true, versionNo: true, publishedAt: true, _count: { select: { days: true } } } },
      },
    });
    const page = toPage(rows, limit);
    const versionIds = page.data.flatMap((p) => p.versions.map((v) => v.id));
    const active = versionIds.length ? await this.tenant.db.fitWorkoutAssignment.groupBy({ by: ['versionId'], where: { versionId: { in: versionIds }, status: 'ACTIVE' }, _count: { _all: true } }) : [];
    const activeByVersion = new Map(active.map((a) => [a.versionId, a._count._all]));
    return {
      data: page.data.map((p) => {
        const current = p.versions.find((v) => v.id === p.currentVersionId) ?? null;
        return {
          id: p.id, name: p.name, description: p.description, archived: p.archivedAt !== null, createdByName: p.createdBy.user.fullName, updatedAt: p.updatedAt,
          currentVersion: current ? { id: current.id, versionNo: current.versionNo, publishedAt: current.publishedAt, dayCount: current._count.days } : null,
          hasDraft: p.versions.some((v) => v.publishedAt === null),
          activeAssignments: p.versions.reduce((n, v) => n + (activeByVersion.get(v.id) ?? 0), 0),
        };
      }),
      meta: page.meta,
    };
  }

  async create(dto: CreatePlanDto) {
    const t = requestContext.tenant();
    const planId = await this.tenant.db.$transaction(async (tx) => {
      const plan = await tx.fitWorkoutPlan.create({ data: { organizationId: t.orgId, name: dto.name, description: dto.description ?? null, createdByMembershipId: t.membershipId } });
      await tx.fitWorkoutPlanVersion.create({ data: { organizationId: t.orgId, planId: plan.id, versionNo: 1 } });
      await this.activity.record({ entityType: 'workout_plan', entityId: plan.id, verb: 'fitness.plan_created', data: { name: dto.name } }, tx);
      return plan.id;
    });
    return this.planDto(planId);
  }

  async get(planId: string) {
    await this.requirePlan(planId);
    return this.planDto(planId);
  }

  async update(planId: string, dto: UpdatePlanDto) {
    await this.requirePlan(planId);
    await this.tenant.db.fitWorkoutPlan.update({ where: { id: planId }, data: { name: dto.name, description: dto.description } });
    return this.planDto(planId);
  }

  async archive(planId: string): Promise<void> {
    await this.requirePlan(planId);
    await this.tenant.db.fitWorkoutPlan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
  }

  // ------------------------------------------------------------------ versions

  async getVersion(planId: string, versionId: string) {
    await this.requireVersion(planId, versionId);
    return this.versionContent(versionId);
  }

  /** Replaces the content of a DRAFT. A published version is immutable: changes go into a new version. */
  async saveContent(planId: string, versionId: string, dto: PlanContentDto) {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    await this.assertContent(dto.days, false);
    const t = requestContext.tenant();
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitWorkoutDay.deleteMany({ where: { versionId } }); // exercises go with their day (cascade)
      for (const [d, day] of dto.days.entries()) {
        const created = await tx.fitWorkoutDay.create({ data: { organizationId: t.orgId, versionId, dayIndex: d + 1, name: day.name, notes: day.notes ?? null } });
        if (day.exercises.length) {
          await tx.fitWorkoutDayExercise.createMany({
            data: day.exercises.map((e, i) => ({
              organizationId: t.orgId, dayId: created.id, exerciseId: e.exerciseId, position: i + 1, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax,
              targetWeightKg: e.targetWeightKg ?? null, restSeconds: e.restSeconds, tempo: e.tempo ?? null, supersetGroup: e.supersetGroup ?? null, notes: e.notes ?? null,
            })),
          });
        }
      }
      await tx.fitWorkoutPlanVersion.update({ where: { id: versionId }, data: { notes: dto.notes ?? null } });
      await tx.fitWorkoutPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } });
    });
    return this.versionContent(versionId);
  }

  /** Semantic rules from the domain plus: every exercise must exist, be visible to this organization and not archived. */
  private async assertContent(days: PlanDayInput[], forPublish: boolean): Promise<void> {
    const issues = validatePlanContent(days, { forPublish });
    const usable = await this.exercises.usableIds(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    days.forEach((d, di) => d.exercises.forEach((e, ei) => {
      if (!usable.has(e.exerciseId)) issues.push({ path: `days[${di}].exercises[${ei}].exerciseId`, rule: 'exerciseUnavailable' });
    }));
    if (issues.length) throw new AppError('PLAN_INVALID', { issues });
  }

  async publish(planId: string, versionId: string) {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    const content = await this.versionContent(versionId);
    await this.assertContent(content.days.map((d) => ({ name: d.name, notes: d.notes, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, targetWeightKg: e.targetWeightKg, restSeconds: e.restSeconds, tempo: e.tempo, supersetGroup: e.supersetGroup, notes: e.notes })) })), true);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitWorkoutPlanVersion.update({ where: { id: versionId }, data: { publishedAt: new Date() } });
      await tx.fitWorkoutPlan.update({ where: { id: planId }, data: { currentVersionId: versionId } });
      await this.audit.record({ action: 'fitness.plan.published', targetType: 'workout_plan', targetId: planId, metadata: { versionId, versionNo: version.versionNo } }, tx);
      await this.activity.record({ entityType: 'workout_plan', entityId: planId, verb: 'fitness.plan_published', data: { versionNo: version.versionNo } }, tx);
    });
    return this.planDto(planId);
  }

  /** Starts a new draft by copying a version (default: the current one). Only one draft may exist at a time. */
  async createVersion(planId: string, fromVersionId?: string) {
    const plan = await this.requirePlan(planId);
    const versions = await this.tenant.db.fitWorkoutPlanVersion.findMany({ where: { planId }, select: { id: true, versionNo: true, publishedAt: true } });
    if (versions.some((v) => v.publishedAt === null)) throw new AppError('CONFLICT', { reason: 'draft_exists' });
    const sourceId = fromVersionId ?? plan.currentVersionId;
    if (fromVersionId && !versions.some((v) => v.id === fromVersionId)) throw new AppError('NOT_FOUND');
    const t = requestContext.tenant();
    const source = sourceId ? await this.versionContent(sourceId) : null;
    const newId = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.fitWorkoutPlanVersion.create({ data: { organizationId: t.orgId, planId, versionNo: Math.max(0, ...versions.map((v) => v.versionNo)) + 1, notes: source?.notes ?? null } });
      for (const day of source?.days ?? []) {
        const d = await tx.fitWorkoutDay.create({ data: { organizationId: t.orgId, versionId: created.id, dayIndex: day.dayIndex, name: day.name, notes: day.notes } });
        if (day.exercises.length) {
          await tx.fitWorkoutDayExercise.createMany({
            data: day.exercises.map((e) => ({ organizationId: t.orgId, dayId: d.id, exerciseId: e.exerciseId, position: e.position, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, targetWeightKg: e.targetWeightKg, restSeconds: e.restSeconds, tempo: e.tempo, supersetGroup: e.supersetGroup, notes: e.notes })),
          });
        }
      }
      return created.id;
    });
    return this.versionContent(newId);
  }

  /** Throws a draft away. A plan that has never been published keeps its first draft. */
  async discardDraft(planId: string, versionId: string): Promise<void> {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    const published = await this.tenant.db.fitWorkoutPlanVersion.count({ where: { planId, publishedAt: { not: null } } });
    if (published === 0) throw new AppError('CONFLICT', { reason: 'only_version' });
    await this.tenant.db.fitWorkoutPlanVersion.delete({ where: { id: versionId } });
  }
}
