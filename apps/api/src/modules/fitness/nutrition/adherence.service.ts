import { Inject, Injectable } from '@nestjs/common';
import { addDays, assignmentActiveOn, isoWeekday, nutritionAdherencePct, scheduledDays, workoutAdherencePct, type MealLogStatus, type WeeklySchedule } from '@pt/domain';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Workout and nutrition adherence of one client over a date range (dates in the organization's time zone). */
@Injectable()
export class AdherenceService {
  constructor(@Inject(TenantPrismaService) private readonly tenant: TenantPrismaService) {}

  async workouts(clientMembershipId: string, from: string, to: string) {
    const assignments = await this.tenant.db.fitWorkoutAssignment.findMany({
      where: { clientMembershipId, status: 'ACTIVE', startDate: { lte: asDate(to) }, OR: [{ endDate: null }, { endDate: { gte: asDate(from) } }] },
      select: { id: true, startDate: true, endDate: true, weeklySchedule: true },
    });
    const completed = assignments.length
      ? await this.tenant.db.fitWorkoutSession.count({ where: { clientMembershipId, assignmentId: { in: assignments.map((a) => a.id) }, completedAt: { not: null }, scheduledDate: { gte: asDate(from), lte: asDate(to) } } })
      : 0;
    let scheduled = 0;
    for (const date of eachDay(from, to)) {
      for (const a of assignments) {
        if (assignmentActiveOn({ startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null, status: 'ACTIVE' }, date)) scheduled += scheduledDays(a.weeklySchedule as WeeklySchedule, date).length;
      }
    }
    return { scheduled, completed, pct: workoutAdherencePct(scheduled, completed) };
  }

  async nutrition(clientMembershipId: string, from: string, to: string) {
    const assignments = await this.tenant.db.fitNutritionAssignment.findMany({
      where: { clientMembershipId, status: 'ACTIVE', startDate: { lte: asDate(to) }, OR: [{ endDate: null }, { endDate: { gte: asDate(from) } }] },
      select: { id: true, startDate: true, endDate: true, version: { select: { days: { select: { weekday: true, meals: { select: { id: true } } } } } } },
    });
    const logs = assignments.length
      ? await this.tenant.db.fitMealLog.findMany({ where: { clientMembershipId, assignmentId: { in: assignments.map((a) => a.id) }, logDate: { gte: asDate(from), lte: asDate(to) } }, select: { assignmentId: true, mealId: true, logDate: true, status: true } })
      : [];
    const perDay: { date: string; planned: number; pct: number | null }[] = [];
    let planned = 0;
    const statuses: MealLogStatus[] = [];
    for (const date of eachDay(from, to)) {
      let dayPlanned = 0;
      const dayStatuses: MealLogStatus[] = [];
      for (const a of assignments) {
        if (!assignmentActiveOn({ startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null, status: 'ACTIVE' }, date)) continue;
        const day = a.version.days.find((d) => d.weekday === isoWeekday(date));
        if (!day) continue;
        dayPlanned += day.meals.length;
        const meals = new Set(day.meals.map((m) => m.id));
        for (const l of logs) if (l.assignmentId === a.id && ymd(l.logDate) === date && meals.has(l.mealId)) dayStatuses.push(l.status);
      }
      if (dayPlanned > 0) perDay.push({ date, planned: dayPlanned, pct: nutritionAdherencePct(dayPlanned, dayStatuses) });
      planned += dayPlanned;
      statuses.push(...dayStatuses);
    }
    return { planned, logged: statuses.length, pct: nutritionAdherencePct(planned, statuses), perDay };
  }
}
