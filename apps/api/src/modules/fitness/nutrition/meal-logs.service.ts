import { Inject, Injectable } from '@nestjs/common';
import { assignmentActiveOn, isoWeekday, mealTotals, nutritionAdherencePct, type MealLogStatus } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { FilesService } from '../../../capabilities/files/files.service.js';
import { orgClock } from '../workouts/assignments.service.js';
import { AdherenceService } from './adherence.service.js';
import type { LogMealDto, MealLogsQuery } from './nutrition.dto.js';

export const MAX_MEAL_PHOTOS = 3;
const MAX_RANGE_DAYS = 31;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const valid = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && ymd(asDate(s)) === s;
const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

@Injectable()
export class MealLogsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AdherenceService) private readonly adherence: AdherenceService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  private logDto(l: { id: string; assignmentId: string; mealId: string; logDate: Date; status: string; notes: string | null; photos: { fileId: string }[] }) {
    return { id: l.id, assignmentId: l.assignmentId, mealId: l.mealId, logDate: ymd(l.logDate), status: l.status as MealLogStatus, notes: l.notes, photoFileIds: l.photos.map((p) => p.fileId) };
  }

  /** The client's meals for a day (today by default) with what they logged. */
  async today(date?: string) {
    const t = requestContext.tenant();
    const clock = await orgClock(this.tenant);
    const day = date ?? clock.today;
    if (!valid(day) || day > clock.today) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'date', rules: ['notInFuture'] }] });
    const assignments = await this.tenant.db.fitNutritionAssignment.findMany({
      where: { clientMembershipId: t.membershipId, status: 'ACTIVE', startDate: { lte: asDate(day) }, OR: [{ endDate: null }, { endDate: { gte: asDate(day) } }] },
      orderBy: { id: 'desc' },
      include: { version: { select: { versionNo: true, plan: { select: { id: true, name: true } }, days: { where: { weekday: isoWeekday(day) }, include: { meals: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } } } } } } },
    });
    const logs = assignments.length ? await this.tenant.db.fitMealLog.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) }, logDate: asDate(day) }, include: { photos: { select: { fileId: true } } } }) : [];
    const items = assignments.map((a) => {
      const d = a.version.days[0];
      return {
        assignmentId: a.id, planName: a.version.plan.name, versionNo: a.version.versionNo, dayNotes: d?.notes ?? null,
        meals: (d?.meals ?? []).map((m) => {
          const log = logs.find((l) => l.assignmentId === a.id && l.mealId === m.id);
          const its = m.items.map((i) => ({ id: i.id, name: i.name, quantity: num(i.quantity), unit: i.unit, calories: i.calories, proteinG: num(i.proteinG), carbsG: num(i.carbsG), fatG: num(i.fatG), notes: i.notes }));
          return { mealId: m.id, mealType: m.mealType, timeOfDay: m.timeOfDay, notes: m.notes, items: its, totals: mealTotals(its), log: log ? this.logDto(log) : null };
        }),
      };
    });
    const planned = items.reduce((n, i) => n + i.meals.length, 0);
    const statuses = items.flatMap((i) => i.meals.flatMap((m) => (m.log ? [m.log.status] : [])));
    return { date: day, today: clock.today, items, adherencePct: nutritionAdherencePct(planned, statuses) };
  }

  /** Logs (or corrects) one planned meal on a day. One log per assignment, meal and date. */
  async log(dto: LogMealDto) {
    const t = requestContext.tenant();
    const clock = await orgClock(this.tenant);
    const date = dto.logDate ?? clock.today;
    if (!valid(date) || date > clock.today) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'logDate', rules: ['notInFuture'] }] });
    const a = await this.tenant.db.fitNutritionAssignment.findFirst({ where: { id: dto.assignmentId, clientMembershipId: t.membershipId, status: 'ACTIVE' } });
    if (!a) throw new AppError('NOT_FOUND');
    if (!assignmentActiveOn({ startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null, status: 'ACTIVE' }, date)) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'logDate', rules: ['outsideAssignment'] }] });
    // the meal must be planned for that weekday in the version the client was given
    const meal = await this.tenant.db.fitMeal.findFirst({ where: { id: dto.mealId, day: { versionId: a.versionId, weekday: isoWeekday(date) } }, select: { id: true } });
    if (!meal) throw new AppError('NOT_FOUND');
    const log = await this.tenant.db.fitMealLog.upsert({
      where: { assignmentId_mealId_logDate: { assignmentId: a.id, mealId: meal.id, logDate: asDate(date) } },
      create: { organizationId: t.orgId, assignmentId: a.id, mealId: meal.id, clientMembershipId: t.membershipId, logDate: asDate(date), status: dto.status, notes: dto.notes ?? null },
      update: { status: dto.status, notes: dto.notes ?? null },
      include: { photos: { select: { fileId: true } } },
    });
    return this.logDto(log);
  }

  private async requireOwnLog(logId: string) {
    const log = await this.tenant.db.fitMealLog.findFirst({ where: { id: logId, clientMembershipId: requestContext.tenant().membershipId }, include: { photos: { select: { fileId: true } } } });
    if (!log) throw new AppError('NOT_FOUND');
    return log;
  }

  /** Attaches a photo the client uploaded (a finished, ordinary image upload of their own). */
  async attachPhoto(logId: string, fileId: string) {
    const t = requestContext.tenant();
    const log = await this.requireOwnLog(logId);
    const file = await this.tenant.db.file.findFirst({ where: { id: fileId, uploaderMembershipId: t.membershipId, status: 'READY', deletedAt: null, mimeType: { startsWith: 'image/' } } });
    if (!file) throw new AppError('NOT_FOUND');
    if (log.photos.some((p) => p.fileId === fileId)) return this.logDto(log);
    if (log.photos.length >= MAX_MEAL_PHOTOS) throw new AppError('CONFLICT', { reason: 'too_many_photos', max: MAX_MEAL_PHOTOS });
    if (await this.tenant.db.fitMealLogPhoto.findFirst({ where: { fileId }, select: { fileId: true } })) throw new AppError('CONFLICT', { reason: 'file_in_use' });
    await this.tenant.db.fitMealLogPhoto.create({ data: { organizationId: t.orgId, mealLogId: logId, fileId } });
    return this.logDto(await this.requireOwnLog(logId));
  }

  async detachPhoto(logId: string, fileId: string) {
    const log = await this.requireOwnLog(logId);
    if (!log.photos.some((p) => p.fileId === fileId)) throw new AppError('NOT_FOUND');
    await this.tenant.db.fitMealLogPhoto.deleteMany({ where: { mealLogId: logId, fileId } });
    await this.files.remove(fileId);
    return this.logDto(await this.requireOwnLog(logId));
  }

  /** A client's logs over a range (their own, or a client the caller may read) with adherence per day. */
  async range(q: MealLogsQuery) {
    const t = requestContext.tenant();
    const subject = q.clientMembershipId ?? t.membershipId;
    if (!(await this.tenant.db.membership.findFirst({ where: { id: subject }, select: { id: true } })) || !(await this.authz.allows('fitness.nutrition.read', { subjectMembershipId: subject }))) throw new AppError('NOT_FOUND');
    const span = (asDate(q.to).getTime() - asDate(q.from).getTime()) / 86_400_000;
    if (!valid(q.from) || !valid(q.to) || span < 0 || span > MAX_RANGE_DAYS - 1) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'from', rules: ['isValidRange'] }] });
    const [logs, adherence] = await Promise.all([
      this.tenant.db.fitMealLog.findMany({
        where: { clientMembershipId: subject, logDate: { gte: asDate(q.from), lte: asDate(q.to) } }, orderBy: [{ logDate: 'asc' }, { id: 'asc' }],
        include: { photos: { select: { fileId: true } }, meal: { select: { mealType: true, timeOfDay: true } }, assignment: { select: { version: { select: { plan: { select: { name: true } } } } } } },
      }),
      this.adherence.nutrition(subject, q.from, q.to),
    ]);
    return { adherence, logs: logs.map((l) => ({ ...this.logDto(l), mealType: l.meal.mealType, timeOfDay: l.meal.timeOfDay, planName: l.assignment.version.plan.name })) };
  }
}
