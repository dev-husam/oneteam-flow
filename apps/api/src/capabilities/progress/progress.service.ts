import { Inject, Injectable } from '@nestjs/common';
import { goalProgress, isGoalReached, scopeAllows, summarizeSeries } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuthorizationService } from '../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateGoalDto, CreateMetricDto, CreateMilestoneDto, CreateRecordDto, GoalsQuery, SeriesQuery, UpdateGoalDto } from './progress.dto.js';

const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));
const MAX_PAST_MS = 10 * 365 * 86_400_000;
const MAX_FUTURE_MS = 5 * 60_000;

/** MetricDefinition is a MIXED model (system metrics + organization metrics): explicit organization filters. */
@Injectable()
export class ProgressService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ helpers

  /** The subject must be an active member the caller may act on under `code`; otherwise 404. */
  private async requireSubject(code: string, subjectMembershipId: string) {
    const member = await this.tenant.db.membership.findFirst({ where: { id: subjectMembershipId, status: 'ACTIVE' }, include: { user: { select: { id: true, fullName: true } } } });
    if (!member || !(await this.authz.allows(code, { subjectMembershipId }))) throw new AppError('NOT_FOUND');
    return member;
  }

  /** The organization's own measurements plus system ones, the latter only for modules the organization has enabled. */
  private async visibleMetrics() {
    const { orgId } = requestContext.tenant();
    const enabled = await this.tenant.db.organizationModule.findMany({ where: { enabled: true, module: { status: 'ENABLED' } }, include: { module: { select: { key: true } } } });
    const moduleKeys = enabled.map((m) => m.module.key);
    return { OR: [{ organizationId: orgId }, { organizationId: null, OR: [{ moduleKey: null }, { moduleKey: { in: moduleKeys } }] }] };
  }

  private async requireMetric(metricId: string) {
    const metric = await this.prisma.metricDefinition.findFirst({ where: { id: metricId, ...(await this.visibleMetrics()) } });
    if (!metric) throw new AppError('NOT_FOUND');
    return metric;
  }

  private metricDto(m: { id: string; key: string; name: string; unit: string; precision: number; higherIsBetter: boolean | null; organizationId: string | null; moduleKey: string | null }) {
    return { id: m.id, key: m.key, name: m.name, unit: m.unit, precision: m.precision, higherIsBetter: m.higherIsBetter, moduleKey: m.moduleKey, system: m.organizationId === null };
  }

  // ------------------------------------------------------------------ metrics

  async listMetrics() {
    const rows = await this.prisma.metricDefinition.findMany({ where: await this.visibleMetrics(), orderBy: [{ moduleKey: 'asc' }, { name: 'asc' }] });
    return rows.map((m) => this.metricDto(m));
  }

  async createMetric(dto: CreateMetricDto) {
    const { orgId } = requestContext.tenant();
    // A system key (weight_kg…) is reserved: an organization measurement with the same key would be ambiguous.
    if (await this.prisma.metricDefinition.findFirst({ where: { organizationId: null, key: dto.key }, select: { id: true } })) throw new AppError('CONFLICT', { reason: 'metric_key_exists' });
    try {
      const m = await this.prisma.metricDefinition.create({
        data: { organizationId: orgId, scopeKey: orgId, key: dto.key, name: dto.name, unit: dto.unit, precision: dto.precision ?? 2, higherIsBetter: dto.higherIsBetter ?? null },
      });
      return this.metricDto(m);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new AppError('CONFLICT', { reason: 'metric_key_exists' });
      throw err;
    }
  }

  // ------------------------------------------------------------------ records

  async record(dto: CreateRecordDto, source?: { type: string; id?: string }) {
    const t = requestContext.tenant();
    const subject = await this.requireSubject('progress.record', dto.subjectMembershipId);
    const metric = await this.requireMetric(dto.metricId);
    const at = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if (at.getTime() > Date.now() + MAX_FUTURE_MS || at.getTime() < Date.now() - MAX_PAST_MS) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'recordedAt', rules: ['isInRange'] }] });

    const record = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.metricRecord.create({
        data: { organizationId: t.orgId, subjectMembershipId: subject.id, metricDefinitionId: metric.id, value: dto.value, recordedAt: at, recordedByMembershipId: t.membershipId, sourceType: source?.type, sourceId: source?.id },
      });
      await this.activity.record({ entityType: 'metric_record', entityId: created.id, verb: 'progress.recorded', subjectMembershipId: subject.id, data: { metric: metric.key, value: dto.value } }, tx);
      return created;
    });
    await this.completeReachedGoals(subject, metric.id, dto.value);
    return { id: record.id, metricId: metric.id, subjectMembershipId: subject.id, value: dto.value, recordedAt: record.recordedAt };
  }

  /** Records a value for a measurement identified by its key (used by modules, e.g. the starting weight of a Fitness client). */
  async recordByKey(subjectMembershipId: string, key: string, value: number, source: { type: string; id?: string }) {
    const metric = await this.prisma.metricDefinition.findFirst({ where: { key, ...(await this.visibleMetrics()) } });
    if (!metric) throw new AppError('NOT_FOUND');
    return this.record({ subjectMembershipId, metricId: metric.id, value }, source);
  }

  /** Ids of the visible measurements with these keys (for modules that record several values at once). */
  async metricIdsByKey(keys: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.metricDefinition.findMany({ where: { key: { in: keys }, ...(await this.visibleMetrics()) }, select: { id: true, key: true, organizationId: true } });
    // an organization's own measurement never shadows a built-in key (keys are reserved), so the first match is the one
    return new Map(rows.map((r) => [r.key, r.id]));
  }

  /**
   * Records several values for one person inside the caller's transaction, so a module can make them atomic with its
   * own change (a check-in and its measurements). Call `afterRecorded` once the transaction has committed.
   */
  async recordBatchInTx(
    tx: Pick<TenantPrismaService['db'], 'metricRecord' | 'activityEvent'>,
    subjectMembershipId: string,
    entries: { metricId: string; key: string; value: number }[],
    source: { type: string; id: string },
  ): Promise<void> {
    const t = requestContext.tenant();
    if (!(await this.authz.allows('progress.record', { subjectMembershipId }))) throw new AppError('FORBIDDEN');
    const at = new Date();
    for (const e of entries) {
      const created = await tx.metricRecord.create({ data: { organizationId: t.orgId, subjectMembershipId, metricDefinitionId: e.metricId, value: e.value, recordedAt: at, recordedByMembershipId: t.membershipId, sourceType: source.type, sourceId: source.id } });
      await this.activity.record({ entityType: 'metric_record', entityId: created.id, verb: 'progress.recorded', subjectMembershipId, data: { metric: e.key, value: e.value } }, tx);
    }
  }

  /** Completes goals reached by freshly recorded values (after the transaction that stored them). */
  async afterRecorded(subjectMembershipId: string, entries: { metricId: string; value: number }[]): Promise<void> {
    const subject = await this.tenant.db.membership.findFirst({ where: { id: subjectMembershipId }, include: { user: { select: { id: true } } } });
    if (!subject) return;
    for (const e of entries) await this.completeReachedGoals(subject, e.metricId, e.value);
  }

  /** A new measurement that reaches an active goal's target completes that goal and tells the people involved. */
  private async completeReachedGoals(subject: { id: string; user: { id: string } }, metricId: string, value: number) {
    const goals = await this.tenant.db.goal.findMany({ where: { subjectMembershipId: subject.id, metricDefinitionId: metricId, status: 'ACTIVE', targetValue: { not: null } } });
    for (const g of goals) {
      const baseline = num(g.baselineValue) ?? value;
      if (!isGoalReached(baseline, num(g.targetValue)!, value)) continue;
      await this.tenant.db.goal.update({ where: { id: g.id }, data: { status: 'ACHIEVED', achievedAt: new Date() } });
      await this.activity.record({ entityType: 'goal', entityId: g.id, verb: 'goal.achieved', subjectMembershipId: subject.id });
      const creator = await this.tenant.db.membership.findFirst({ where: { id: g.createdByMembershipId }, select: { userId: true } });
      const org = await this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } });
      await this.notifications.notify({ userIds: [subject.user.id, ...(creator ? [creator.userId] : [])], organizationId: requestContext.tenant().orgId, type: 'goal.achieved', params: { title: g.title }, data: { orgSlug: org.slug, goalId: g.id } });
    }
  }

  async series(q: SeriesQuery) {
    await this.requireSubject('progress.read', q.subjectMembershipId);
    const rows = await this.tenant.db.metricRecord.findMany({
      where: {
        subjectMembershipId: q.subjectMembershipId, voidedAt: null,
        ...(q.metricId ? { metricDefinitionId: q.metricId } : {}),
        ...(q.from || q.to ? { recordedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { recordedAt: 'asc' }, take: q.limit ?? 200,
      include: { recordedBy: { include: { user: { select: { fullName: true } } } } },
    });
    return rows.map((r) => ({ id: r.id, metricId: r.metricDefinitionId, value: num(r.value)!, recordedAt: r.recordedAt, recordedByName: r.recordedBy.user.fullName, sourceType: r.sourceType }));
  }

  async summary(q: SeriesQuery & { metricId: string }) {
    const metric = await this.requireMetric(q.metricId);
    const points = await this.series({ ...q, limit: 500 });
    return { metric: this.metricDto(metric), points, summary: summarizeSeries(points.map((p) => ({ value: p.value, at: p.recordedAt.toISOString() })), metric.higherIsBetter) };
  }

  /** Records are immutable: a mistake is voided (kept, hidden from charts) and the right value recorded anew. */
  async voidRecord(recordId: string, reason: string): Promise<void> {
    const t = requestContext.tenant();
    const rec = await this.tenant.db.metricRecord.findFirst({ where: { id: recordId, voidedAt: null } });
    if (!rec || !(await this.authz.allows('progress.record', { subjectMembershipId: rec.subjectMembershipId, ownerMembershipId: rec.recordedByMembershipId }))) throw new AppError('NOT_FOUND');
    // Personal access means "only what I recorded": a client cannot void the trainer's measurements of them.
    if (this.authz.grantFor('progress.record') === 'OWN' && rec.recordedByMembershipId !== t.membershipId) throw new AppError('FORBIDDEN');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.metricRecord.update({ where: { id: recordId }, data: { voidedAt: new Date(), voidReason: reason } });
      await this.activity.record({ entityType: 'metric_record', entityId: recordId, verb: 'progress.voided', subjectMembershipId: rec.subjectMembershipId, data: { reason } }, tx);
    });
  }

  // ------------------------------------------------------------------ goals

  private async goalDto(g: { id: string; subjectMembershipId: string; metricDefinitionId: string | null; title: string; description: string | null; baselineValue: unknown; targetValue: unknown; direction: string | null; dueDate: Date | null; status: string; achievedAt: Date | null; milestones: { id: string; title: string; targetValue: unknown; dueDate: Date | null; achievedAt: Date | null }[] }) {
    let current: number | null = null;
    if (g.metricDefinitionId) {
      const latest = await this.tenant.db.metricRecord.findFirst({ where: { subjectMembershipId: g.subjectMembershipId, metricDefinitionId: g.metricDefinitionId, voidedAt: null }, orderBy: { recordedAt: 'desc' } });
      current = latest ? num(latest.value) : null;
    }
    const baseline = num(g.baselineValue as never);
    const target = num(g.targetValue as never);
    return {
      id: g.id, subjectMembershipId: g.subjectMembershipId, metricId: g.metricDefinitionId, title: g.title, description: g.description,
      baselineValue: baseline, targetValue: target, direction: g.direction, dueDate: g.dueDate, status: g.status, achievedAt: g.achievedAt,
      currentValue: current, progress: baseline !== null && target !== null ? goalProgress(baseline, target, current) : null,
      milestones: g.milestones.map((m) => ({ id: m.id, title: m.title, targetValue: num(m.targetValue as never), dueDate: m.dueDate, achievedAt: m.achievedAt })),
    };
  }

  async createGoal(dto: CreateGoalDto) {
    const t = requestContext.tenant();
    const subject = await this.requireSubject('goal.manage', dto.subjectMembershipId);
    if (dto.metricId) await this.requireMetric(dto.metricId);
    let baseline = dto.baselineValue ?? null;
    if (baseline === null && dto.metricId && dto.targetValue !== undefined) {
      const latest = await this.tenant.db.metricRecord.findFirst({ where: { subjectMembershipId: subject.id, metricDefinitionId: dto.metricId, voidedAt: null }, orderBy: { recordedAt: 'desc' } });
      baseline = latest ? num(latest.value) : null;
    }
    const direction = baseline !== null && dto.targetValue !== undefined ? (dto.targetValue >= baseline ? 'INCREASE' : 'DECREASE') : null;
    const goal = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.goal.create({
        data: { organizationId: t.orgId, subjectMembershipId: subject.id, metricDefinitionId: dto.metricId, title: dto.title, description: dto.description, baselineValue: baseline, targetValue: dto.targetValue, direction, dueDate: dto.dueDate ? new Date(dto.dueDate) : null, createdByMembershipId: t.membershipId },
        include: { milestones: true },
      });
      await this.activity.record({ entityType: 'goal', entityId: created.id, verb: 'goal.created', subjectMembershipId: subject.id, data: { title: dto.title } }, tx);
      return created;
    });
    return this.goalDto(goal);
  }

  async listGoals(q: GoalsQuery) {
    await this.requireSubject('progress.read', q.subjectMembershipId);
    const rows = await this.tenant.db.goal.findMany({ where: { subjectMembershipId: q.subjectMembershipId, ...(q.status ? { status: q.status } : {}) }, orderBy: { id: 'desc' }, take: 100, include: { milestones: { orderBy: { id: 'asc' } } } });
    return Promise.all(rows.map((g) => this.goalDto(g)));
  }

  private async requireGoal(goalId: string) {
    const goal = await this.tenant.db.goal.findFirst({ where: { id: goalId }, include: { milestones: { orderBy: { id: 'asc' } } } });
    if (!goal) throw new AppError('NOT_FOUND');
    await this.requireSubject('goal.manage', goal.subjectMembershipId);
    return goal;
  }

  async updateGoal(goalId: string, dto: UpdateGoalDto) {
    await this.requireGoal(goalId);
    const updated = await this.tenant.db.goal.update({
      where: { id: goalId },
      data: { title: dto.title, targetValue: dto.targetValue, ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}), ...(dto.status ? { status: dto.status } : {}) },
      include: { milestones: { orderBy: { id: 'asc' } } },
    });
    await this.activity.record({ entityType: 'goal', entityId: goalId, verb: 'goal.updated', subjectMembershipId: updated.subjectMembershipId });
    return this.goalDto(updated);
  }

  async addMilestone(goalId: string, dto: CreateMilestoneDto) {
    const goal = await this.requireGoal(goalId);
    const m = await this.tenant.db.goalMilestone.create({ data: { organizationId: requestContext.tenant().orgId, goalId, title: dto.title, targetValue: dto.targetValue, dueDate: dto.dueDate ? new Date(dto.dueDate) : null } });
    await this.activity.record({ entityType: 'goal', entityId: goalId, verb: 'goal.milestone_added', subjectMembershipId: goal.subjectMembershipId, data: { title: dto.title } });
    return { id: m.id, title: m.title, targetValue: num(m.targetValue), dueDate: m.dueDate, achievedAt: m.achievedAt };
  }

  async achieveMilestone(goalId: string, milestoneId: string) {
    const goal = await this.requireGoal(goalId);
    const result = await this.tenant.db.goalMilestone.updateMany({ where: { id: milestoneId, goalId, achievedAt: null }, data: { achievedAt: new Date() } });
    if (result.count !== 1) throw new AppError('NOT_FOUND');
    await this.activity.record({ entityType: 'goal', entityId: goalId, verb: 'goal.milestone_achieved', subjectMembershipId: goal.subjectMembershipId });
  }

  // ------------------------------------------------------------------ group progress

  /** Latest value per member of a group, limited to the people the caller may see progress of. */
  async groupSummary(groupId: string, metricId: string) {
    const metric = await this.requireMetric(metricId);
    const t = requestContext.tenant();
    const group = await this.tenant.db.group.findFirst({ where: { id: groupId, archivedAt: null }, include: { members: { include: { membership: { include: { user: { select: { fullName: true } } } } } } } });
    if (!group || !scopeAllows(t.grants['group.read'], { isOwn: group.createdByMembershipId === t.membershipId, isAssigned: false })) throw new AppError('NOT_FOUND');

    const rows: { membershipId: string; fullName: string; latest: number | null; at: Date | null }[] = [];
    for (const gm of group.members) {
      if (gm.membership.status !== 'ACTIVE' || !(await this.authz.allows('progress.read', { subjectMembershipId: gm.membershipId }))) continue;
      const latest = await this.tenant.db.metricRecord.findFirst({ where: { subjectMembershipId: gm.membershipId, metricDefinitionId: metricId, voidedAt: null }, orderBy: { recordedAt: 'desc' } });
      rows.push({ membershipId: gm.membershipId, fullName: gm.membership.user.fullName, latest: latest ? num(latest.value) : null, at: latest?.recordedAt ?? null });
    }
    const values = rows.flatMap((r) => (r.latest === null ? [] : [r.latest]));
    return {
      metric: this.metricDto(metric), members: rows,
      aggregate: { visibleMembers: rows.length, withData: values.length, average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000 : null, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null },
    };
  }
}
