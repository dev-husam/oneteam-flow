import { Inject, Injectable } from '@nestjs/common';
import { addDays, checkinDueState, weekEndOf, weekStartOf, type CheckinDueState, type CheckinStatus } from '@pt/domain';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';

const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

export interface CheckinStanding {
  tracked: boolean;
  trackedLastWeek: boolean;
  thisWeek: CheckinStatus | null;
  lastWeek: CheckinStatus | null;
}

/** Where clients stand with their weekly check-in (used by the client list and by reminders). Tenant-scoped. */
@Injectable()
export class CheckinStateService {
  constructor(@Inject(TenantPrismaService) private readonly tenant: TenantPrismaService) {}

  /**
   * A client is "tracked" for a week when they have an active workout or nutrition assignment overlapping it:
   * only then is a check-in expected.
   */
  async standings(today: string, weekStartsOn: number, clientIds?: string[]): Promise<Map<string, CheckinStanding>> {
    const thisStart = weekStartOf(today, weekStartsOn);
    const lastStart = addDays(thisStart, -7);
    const lastEnd = weekEndOf(lastStart);
    const thisEnd = weekEndOf(thisStart);
    const overlap = { status: 'ACTIVE' as const, startDate: { lte: asDate(thisEnd) }, OR: [{ endDate: null }, { endDate: { gte: asDate(lastStart) } }], ...(clientIds ? { clientMembershipId: { in: clientIds } } : {}) };
    const [workouts, meals] = await Promise.all([
      this.tenant.db.fitWorkoutAssignment.findMany({ where: overlap, select: { clientMembershipId: true, startDate: true, endDate: true } }),
      this.tenant.db.fitNutritionAssignment.findMany({ where: overlap, select: { clientMembershipId: true, startDate: true, endDate: true } }),
    ]);
    const ids = new Set([...(clientIds ?? []), ...workouts.map((a) => a.clientMembershipId), ...meals.map((a) => a.clientMembershipId)]);
    const checkins = ids.size ? await this.tenant.db.fitCheckin.findMany({ where: { clientMembershipId: { in: [...ids] }, weekStartDate: { in: [asDate(thisStart), asDate(lastStart)] } }, select: { clientMembershipId: true, weekStartDate: true, status: true } }) : [];
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const result = new Map<string, CheckinStanding>();
    for (const id of ids) {
      const mine = [...workouts, ...meals].filter((a) => a.clientMembershipId === id);
      const within = (from: string, to: string) => mine.some((a) => day(a.startDate) <= to && (a.endDate === null || day(a.endDate) >= from));
      const statusOf = (start: string) => checkins.find((c) => c.clientMembershipId === id && day(c.weekStartDate) === start)?.status ?? null;
      result.set(id, { tracked: within(thisStart, today), trackedLastWeek: within(lastStart, lastEnd), thisWeek: statusOf(thisStart), lastWeek: statusOf(lastStart) });
    }
    return result;
  }

  dueState(s: CheckinStanding | undefined, today: string, weekStartsOn: number): CheckinDueState {
    return checkinDueState({ today, weekStartsOn, thisWeek: s?.thisWeek ?? null, lastWeek: s?.lastWeek ?? null, tracked: s?.tracked ?? false, trackedLastWeek: s?.trackedLastWeek ?? false });
  }
}
