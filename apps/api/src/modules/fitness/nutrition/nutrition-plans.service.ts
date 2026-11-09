import { Inject, Injectable } from '@nestjs/common';
import { mealTotals, validateNutritionContent, type NutritionDayInput } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import type { CreatePlanDto, ListPlansQuery, UpdatePlanDto } from '../plans/plans.dto.js';
import type { NutritionContentDto } from './nutrition.dto.js';

const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

const versionInclude = {
  days: { orderBy: { weekday: 'asc' as const }, include: { meals: { orderBy: { position: 'asc' as const }, include: { items: { orderBy: { position: 'asc' as const } } } } } },
};

type VersionRow = {
  id: string; planId: string; versionNo: number; publishedAt: Date | null; notes: string | null;
  days: { id: string; weekday: number; notes: string | null; meals: { id: string; mealType: string; position: number; timeOfDay: string | null; notes: string | null; items: { id: string; position: number; name: string; quantity: unknown; unit: string | null; calories: number | null; proteinG: unknown; carbsG: unknown; fatG: unknown; notes: string | null }[] }[] }[];
};

/** Nutrition plans use the same rules as workout plans: a draft is editable, a published version never changes. */
@Injectable()
export class NutritionPlansService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  private manageScope() {
    const t = requestContext.tenant();
    switch (t.grants['fitness.nutrition_plan.manage']) {
      case 'ORG':
      case 'ALL':
        return {};
      case 'OWN':
        return { createdByMembershipId: t.membershipId };
      default:
        return { id: { in: [] as string[] } };
    }
  }

  async requirePlan(planId: string) {
    const plan = await this.tenant.db.fitNutritionPlan.findFirst({ where: { id: planId, ...this.manageScope() } });
    if (!plan) throw new AppError('NOT_FOUND');
    return plan;
  }

  private async requireVersion(planId: string, versionId: string) {
    await this.requirePlan(planId);
    const v = await this.tenant.db.fitNutritionPlanVersion.findFirst({ where: { id: versionId, planId } });
    if (!v) throw new AppError('NOT_FOUND');
    return v;
  }

  static versionDto(v: VersionRow) {
    return {
      id: v.id, planId: v.planId, versionNo: v.versionNo, publishedAt: v.publishedAt, published: v.publishedAt !== null, notes: v.notes,
      days: v.days.map((d) => {
        const meals = d.meals.map((m) => {
          const items = m.items.map((i) => ({ id: i.id, position: i.position, name: i.name, quantity: num(i.quantity as never), unit: i.unit, calories: i.calories, proteinG: num(i.proteinG as never), carbsG: num(i.carbsG as never), fatG: num(i.fatG as never), notes: i.notes }));
          return { id: m.id, mealType: m.mealType, position: m.position, timeOfDay: m.timeOfDay, notes: m.notes, items, totals: mealTotals(items) };
        });
        return { id: d.id, weekday: d.weekday, notes: d.notes, meals, totals: mealTotals(meals.flatMap((m) => m.items)) };
      }),
    };
  }

  async versionContent(versionId: string) {
    const v = await this.tenant.db.fitNutritionPlanVersion.findFirst({ where: { id: versionId }, include: versionInclude });
    if (!v) throw new AppError('NOT_FOUND');
    return NutritionPlansService.versionDto(v as never);
  }

  private async planDto(planId: string) {
    const plan = await this.tenant.db.fitNutritionPlan.findFirstOrThrow({
      where: { id: planId },
      include: { createdBy: { include: { user: { select: { fullName: true } } } }, versions: { orderBy: { versionNo: 'asc' }, include: { _count: { select: { days: true, assignments: true } } } } },
    });
    const draft = plan.versions.find((v) => v.publishedAt === null);
    const current = plan.versions.find((v) => v.id === plan.currentVersionId) ?? null;
    return {
      id: plan.id, name: plan.name, description: plan.description, archived: plan.archivedAt !== null, createdByMembershipId: plan.createdByMembershipId, createdByName: plan.createdBy.user.fullName, createdAt: plan.createdAt, updatedAt: plan.updatedAt,
      currentVersion: current ? { id: current.id, versionNo: current.versionNo, publishedAt: current.publishedAt, dayCount: current._count.days } : null,
      draftVersionId: draft?.id ?? null,
      versions: plan.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, publishedAt: v.publishedAt, notes: v.notes, dayCount: v._count.days, assignmentCount: v._count.assignments })),
    };
  }

  async list(q: ListPlansQuery) {
    const limit = pageSize(q);
    const rows = await this.tenant.db.fitNutritionPlan.findMany({
      where: { AND: [this.manageScope(), q.archived ? { archivedAt: { not: null } } : { archivedAt: null }, q.q ? { name: { contains: q.q } } : {}, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1,
      include: { createdBy: { include: { user: { select: { fullName: true } } } }, versions: { orderBy: { versionNo: 'asc' }, select: { id: true, versionNo: true, publishedAt: true, _count: { select: { days: true } } } } },
    });
    const page = toPage(rows, limit);
    const versionIds = page.data.flatMap((p) => p.versions.map((v) => v.id));
    const active = versionIds.length ? await this.tenant.db.fitNutritionAssignment.groupBy({ by: ['versionId'], where: { versionId: { in: versionIds }, status: 'ACTIVE' }, _count: { _all: true } }) : [];
    const byVersion = new Map(active.map((a) => [a.versionId, a._count._all]));
    return {
      data: page.data.map((p) => {
        const current = p.versions.find((v) => v.id === p.currentVersionId) ?? null;
        return {
          id: p.id, name: p.name, description: p.description, archived: p.archivedAt !== null, createdByName: p.createdBy.user.fullName, updatedAt: p.updatedAt,
          currentVersion: current ? { id: current.id, versionNo: current.versionNo, publishedAt: current.publishedAt, dayCount: current._count.days } : null,
          hasDraft: p.versions.some((v) => v.publishedAt === null), activeAssignments: p.versions.reduce((n, v) => n + (byVersion.get(v.id) ?? 0), 0),
        };
      }),
      meta: page.meta,
    };
  }

  async create(dto: CreatePlanDto) {
    const t = requestContext.tenant();
    const id = await this.tenant.db.$transaction(async (tx) => {
      const plan = await tx.fitNutritionPlan.create({ data: { organizationId: t.orgId, name: dto.name, description: dto.description ?? null, createdByMembershipId: t.membershipId } });
      await tx.fitNutritionPlanVersion.create({ data: { organizationId: t.orgId, planId: plan.id, versionNo: 1 } });
      await this.activity.record({ entityType: 'nutrition_plan', entityId: plan.id, verb: 'fitness.nutrition_plan_created', data: { name: dto.name } }, tx);
      return plan.id;
    });
    return this.planDto(id);
  }

  async get(planId: string) {
    await this.requirePlan(planId);
    return this.planDto(planId);
  }

  async update(planId: string, dto: UpdatePlanDto) {
    await this.requirePlan(planId);
    await this.tenant.db.fitNutritionPlan.update({ where: { id: planId }, data: { name: dto.name, description: dto.description } });
    return this.planDto(planId);
  }

  async archive(planId: string): Promise<void> {
    await this.requirePlan(planId);
    await this.tenant.db.fitNutritionPlan.update({ where: { id: planId }, data: { archivedAt: new Date() } });
  }

  async getVersion(planId: string, versionId: string) {
    await this.requireVersion(planId, versionId);
    return this.versionContent(versionId);
  }

  private assertContent(days: NutritionDayInput[], forPublish: boolean): void {
    const issues = validateNutritionContent(days, { forPublish });
    if (issues.length) throw new AppError('PLAN_INVALID', { issues });
  }

  async saveContent(planId: string, versionId: string, dto: NutritionContentDto) {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    this.assertContent(dto.days as NutritionDayInput[], false);
    const t = requestContext.tenant();
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitNutritionDay.deleteMany({ where: { versionId } }); // meals and items go with their day (cascade)
      for (const day of dto.days) {
        const d = await tx.fitNutritionDay.create({ data: { organizationId: t.orgId, versionId, weekday: day.weekday, notes: day.notes ?? null } });
        for (const [mi, meal] of day.meals.entries()) {
          const m = await tx.fitMeal.create({ data: { organizationId: t.orgId, dayId: d.id, mealType: meal.mealType, position: mi + 1, timeOfDay: meal.timeOfDay ?? null, notes: meal.notes ?? null } });
          if (meal.items.length) {
            await tx.fitMealItem.createMany({
              data: meal.items.map((i, ii) => ({ organizationId: t.orgId, mealId: m.id, position: ii + 1, name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null, calories: i.calories ?? null, proteinG: i.proteinG ?? null, carbsG: i.carbsG ?? null, fatG: i.fatG ?? null, notes: i.notes ?? null })),
            });
          }
        }
      }
      await tx.fitNutritionPlanVersion.update({ where: { id: versionId }, data: { notes: dto.notes ?? null } });
      await tx.fitNutritionPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } });
    });
    return this.versionContent(versionId);
  }

  async publish(planId: string, versionId: string) {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    const content = await this.versionContent(versionId);
    this.assertContent(content.days.map((d) => ({ weekday: d.weekday, notes: d.notes, meals: d.meals.map((m) => ({ mealType: m.mealType as 'LUNCH', timeOfDay: m.timeOfDay, notes: m.notes, items: m.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, notes: i.notes })) })) })), true);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitNutritionPlanVersion.update({ where: { id: versionId }, data: { publishedAt: new Date() } });
      await tx.fitNutritionPlan.update({ where: { id: planId }, data: { currentVersionId: versionId } });
      await this.audit.record({ action: 'fitness.nutrition_plan.published', targetType: 'nutrition_plan', targetId: planId, metadata: { versionId, versionNo: version.versionNo } }, tx);
      await this.activity.record({ entityType: 'nutrition_plan', entityId: planId, verb: 'fitness.nutrition_plan_published', data: { versionNo: version.versionNo } }, tx);
    });
    return this.planDto(planId);
  }

  async createVersion(planId: string, fromVersionId?: string) {
    const plan = await this.requirePlan(planId);
    const versions = await this.tenant.db.fitNutritionPlanVersion.findMany({ where: { planId }, select: { id: true, versionNo: true, publishedAt: true } });
    if (versions.some((v) => v.publishedAt === null)) throw new AppError('CONFLICT', { reason: 'draft_exists' });
    if (fromVersionId && !versions.some((v) => v.id === fromVersionId)) throw new AppError('NOT_FOUND');
    const sourceId = fromVersionId ?? plan.currentVersionId;
    const source = sourceId ? await this.versionContent(sourceId) : null;
    const t = requestContext.tenant();
    const newId = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.fitNutritionPlanVersion.create({ data: { organizationId: t.orgId, planId, versionNo: Math.max(0, ...versions.map((v) => v.versionNo)) + 1, notes: source?.notes ?? null } });
      for (const day of source?.days ?? []) {
        const d = await tx.fitNutritionDay.create({ data: { organizationId: t.orgId, versionId: created.id, weekday: day.weekday, notes: day.notes } });
        for (const meal of day.meals) {
          const m = await tx.fitMeal.create({ data: { organizationId: t.orgId, dayId: d.id, mealType: meal.mealType, position: meal.position, timeOfDay: meal.timeOfDay, notes: meal.notes } });
          if (meal.items.length) await tx.fitMealItem.createMany({ data: meal.items.map((i) => ({ organizationId: t.orgId, mealId: m.id, position: i.position, name: i.name, quantity: i.quantity, unit: i.unit, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, notes: i.notes })) });
        }
      }
      return created.id;
    });
    return this.versionContent(newId);
  }

  async discardDraft(planId: string, versionId: string): Promise<void> {
    const version = await this.requireVersion(planId, versionId);
    if (version.publishedAt) throw new AppError('PLAN_VERSION_LOCKED');
    if ((await this.tenant.db.fitNutritionPlanVersion.count({ where: { planId, publishedAt: { not: null } } })) === 0) throw new AppError('CONFLICT', { reason: 'only_version' });
    await this.tenant.db.fitNutritionPlanVersion.delete({ where: { id: versionId } });
  }
}
