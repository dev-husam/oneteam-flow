import { Inject, Injectable } from '@nestjs/common';
import { addDays, assignmentActiveOn, scheduledDays, sessionVolume, type WeeklySchedule } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import { NotificationsService } from '../../../capabilities/notifications/notifications.service.js';
import { ExercisesService } from '../exercises/exercises.service.js';
import { orgClock } from './assignments.service.js';
import type { CompleteSessionDto, ListSessionsQuery, LogSetDto, StartSessionDto } from './workouts.dto.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

@Injectable()
export class SessionsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ the client's own view

  /** Today's workout, the next days and the plan days the client may do at any time. */
  async today() {
    const t = requestContext.tenant();
    const clock = await orgClock(this.tenant);
    const horizon = addDays(clock.today, 6);
    const assignments = await this.tenant.db.fitWorkoutAssignment.findMany({
      where: { clientMembershipId: t.membershipId, status: 'ACTIVE', startDate: { lte: asDate(horizon) }, OR: [{ endDate: null }, { endDate: { gte: asDate(clock.today) } }] },
      orderBy: { id: 'desc' },
      include: { version: { select: { versionNo: true, plan: { select: { id: true, name: true } }, days: { orderBy: { dayIndex: 'asc' }, select: { id: true, dayIndex: true, name: true, _count: { select: { exercises: true } } } } } } },
    });
    const sessions = assignments.length
      ? await this.tenant.db.fitWorkoutSession.findMany({ where: { assignmentId: { in: assignments.map((a) => a.id) }, scheduledDate: asDate(clock.today) }, select: { id: true, assignmentId: true, dayId: true, startedAt: true, completedAt: true } })
      : [];

    const today: unknown[] = [];
    const upcoming: { date: string; items: unknown[] }[] = [];
    for (let offset = 0; offset <= 6; offset++) {
      const date = addDays(clock.today, offset);
      const items: unknown[] = [];
      for (const a of assignments) {
        const win = { startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null, status: 'ACTIVE' as const };
        if (!assignmentActiveOn(win, date)) continue;
        for (const dayIndex of scheduledDays(a.weeklySchedule as WeeklySchedule, date)) {
          const day = a.version.days.find((d) => d.dayIndex === dayIndex);
          if (!day) continue;
          const base = { assignmentId: a.id, planName: a.version.plan.name, dayId: day.id, dayIndex, dayName: day.name, exerciseCount: day._count.exercises };
          if (offset === 0) today.push({ ...base, session: sessions.find((s) => s.assignmentId === a.id && s.dayId === day.id) ?? null });
          else items.push(base);
        }
      }
      if (offset > 0 && items.length) upcoming.push({ date, items });
    }
    return {
      date: clock.today, timezone: clock.timezone, today, upcoming,
      assignments: assignments.filter((a) => ymd(a.startDate) <= clock.today).map((a) => ({
        assignmentId: a.id, planId: a.version.plan.id, planName: a.version.plan.name, versionNo: a.version.versionNo, startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null,
        days: a.version.days.map((d) => ({ dayId: d.id, dayIndex: d.dayIndex, name: d.name, exerciseCount: d._count.exercises })),
      })),
    };
  }

  /** Starts (or resumes) the session for a plan day on a date. Idempotent per assignment, day and date. */
  async start(dto: StartSessionDto) {
    const t = requestContext.tenant();
    const clock = await orgClock(this.tenant);
    const date = dto.scheduledDate ?? clock.today;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || ymd(asDate(date)) !== date || date > clock.today) {
      throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'scheduledDate', rules: ['notInFuture'] }] });
    }
    const a = await this.tenant.db.fitWorkoutAssignment.findFirst({ where: { id: dto.assignmentId, clientMembershipId: t.membershipId, status: 'ACTIVE' } });
    if (!a) throw new AppError('NOT_FOUND');
    if (!assignmentActiveOn({ startDate: ymd(a.startDate), endDate: a.endDate ? ymd(a.endDate) : null, status: 'ACTIVE' }, date)) {
      throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'scheduledDate', rules: ['outsideAssignment'] }] });
    }
    const day = await this.tenant.db.fitWorkoutDay.findFirst({ where: { id: dto.dayId, versionId: a.versionId }, select: { id: true } });
    if (!day) throw new AppError('NOT_FOUND');

    const existing = await this.tenant.db.fitWorkoutSession.findFirst({ where: { assignmentId: a.id, dayId: day.id, scheduledDate: asDate(date) } });
    if (existing) return this.get(existing.id);
    try {
      const created = await this.tenant.db.fitWorkoutSession.create({ data: { organizationId: t.orgId, assignmentId: a.id, dayId: day.id, clientMembershipId: t.membershipId, scheduledDate: asDate(date), startedAt: new Date() } });
      return await this.get(created.id);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // lost a race with a second tap: use the winner
      const winner = await this.tenant.db.fitWorkoutSession.findFirstOrThrow({ where: { assignmentId: a.id, dayId: day.id, scheduledDate: asDate(date) } });
      return this.get(winner.id);
    }
  }

  /** A session the caller may read (their own, their clients', or any under ORG scope); otherwise 404. */
  private async requireReadable(id: string) {
    const s = await this.tenant.db.fitWorkoutSession.findFirst({ where: { id } });
    if (!s || !(await this.authz.allows('fitness.workout.read', { subjectMembershipId: s.clientMembershipId }))) throw new AppError('NOT_FOUND');
    return s;
  }

  /** Only the client can log or finish their own session. */
  private async requireOwnOpen(id: string) {
    const t = requestContext.tenant();
    const s = await this.tenant.db.fitWorkoutSession.findFirst({ where: { id, clientMembershipId: t.membershipId } });
    if (!s) throw new AppError('NOT_FOUND');
    if (s.completedAt) throw new AppError('SESSION_COMPLETED');
    return s;
  }

  async get(id: string) {
    const s0 = await this.requireReadable(id);
    const s = await this.tenant.db.fitWorkoutSession.findFirstOrThrow({
      where: { id },
      include: {
        client: { include: { user: { select: { fullName: true } } } },
        assignment: { select: { version: { select: { versionNo: true, plan: { select: { id: true, name: true } } } } } },
        day: { include: { exercises: { orderBy: { position: 'asc' }, include: { exercise: true } } } },
        setLogs: { orderBy: [{ setNo: 'asc' }] },
      },
    });
    const exerciseIds = s.day.exercises.map((e) => e.exerciseId);
    // What the client did last time for each exercise (most recent earlier completed session), to show beside the targets.
    const earlier = exerciseIds.length
      ? await this.tenant.db.fitWorkoutSetLog.findMany({
          where: { session: { clientMembershipId: s.clientMembershipId, completedAt: { not: null }, scheduledDate: { lt: s.scheduledDate } }, dayExercise: { exerciseId: { in: exerciseIds } } },
          orderBy: [{ session: { scheduledDate: 'desc' } }, { setNo: 'asc' }], take: 300,
          include: { dayExercise: { select: { exerciseId: true } }, session: { select: { scheduledDate: true } } },
        })
      : [];
    const previousFor = (exerciseId: string) => {
      const mine = earlier.filter((l) => l.dayExercise.exerciseId === exerciseId);
      if (mine.length === 0) return null;
      const date = ymd(mine[0]!.session.scheduledDate);
      return { date, sets: mine.filter((l) => ymd(l.session.scheduledDate) === date).map((l) => ({ setNo: l.setNo, repsDone: l.repsDone, weightKg: num(l.weightKg) })) };
    };
    const logged = s.setLogs.map((l) => ({ repsDone: l.repsDone, weightKg: num(l.weightKg) }));
    return {
      id: s.id, assignmentId: s.assignmentId, planId: s.assignment.version.plan.id, planName: s.assignment.version.plan.name, versionNo: s.assignment.version.versionNo,
      dayId: s.dayId, dayName: s.day.name, dayNotes: s.day.notes, clientMembershipId: s.clientMembershipId, clientName: s.client.user.fullName,
      scheduledDate: ymd(s.scheduledDate), startedAt: s.startedAt, completedAt: s.completedAt, rpe: s.rpe, notes: s.notes, volume: sessionVolume(logged), editable: s0.completedAt === null && s0.clientMembershipId === requestContext.tenant().membershipId,
      exercises: s.day.exercises.map((e) => ({
        dayExerciseId: e.id, position: e.position, exercise: ExercisesService.toDto(e.exercise), sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, targetWeightKg: num(e.targetWeightKg),
        restSeconds: e.restSeconds, tempo: e.tempo, supersetGroup: e.supersetGroup, notes: e.notes,
        logged: s.setLogs.filter((l) => l.dayExerciseId === e.id).map((l) => ({ setNo: l.setNo, repsDone: l.repsDone, weightKg: num(l.weightKg) })),
        previous: previousFor(e.exerciseId),
      })),
    };
  }

  async logSet(id: string, dto: LogSetDto) {
    const s = await this.requireOwnOpen(id);
    const t = requestContext.tenant();
    const dayExercise = await this.tenant.db.fitWorkoutDayExercise.findFirst({ where: { id: dto.dayExerciseId, dayId: s.dayId }, select: { id: true } });
    if (!dayExercise) throw new AppError('NOT_FOUND');
    await this.tenant.db.fitWorkoutSetLog.upsert({
      where: { sessionId_dayExerciseId_setNo: { sessionId: id, dayExerciseId: dto.dayExerciseId, setNo: dto.setNo } },
      create: { organizationId: t.orgId, sessionId: id, dayExerciseId: dto.dayExerciseId, setNo: dto.setNo, repsDone: dto.repsDone, weightKg: dto.weightKg ?? null },
      update: { repsDone: dto.repsDone, weightKg: dto.weightKg ?? null, completedAt: new Date() },
    });
    return this.get(id);
  }

  async removeSet(id: string, dayExerciseId: string, setNo: number) {
    await this.requireOwnOpen(id);
    await this.tenant.db.fitWorkoutSetLog.deleteMany({ where: { sessionId: id, dayExerciseId, setNo } });
    return this.get(id);
  }

  async complete(id: string, dto: CompleteSessionDto) {
    const s = await this.requireOwnOpen(id);
    const t = requestContext.tenant();
    const sets = await this.tenant.db.fitWorkoutSetLog.count({ where: { sessionId: id } });
    if (sets === 0) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'sets', rules: ['arrayNotEmpty'] }] });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitWorkoutSession.update({ where: { id }, data: { completedAt: new Date(), rpe: dto.rpe ?? null, notes: dto.notes ?? null } });
      await this.activity.record({ entityType: 'workout_session', entityId: id, verb: 'fitness.workout_completed', subjectMembershipId: s.clientMembershipId }, tx);
    });

    // Tell the client's trainers (never the client themself).
    const [client, day, clock, trainers] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: s.clientMembershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.fitWorkoutDay.findFirstOrThrow({ where: { id: s.dayId }, select: { name: true } }),
      orgClock(this.tenant),
      this.tenant.db.memberAssignment.findMany({ where: { participantMembershipId: s.clientMembershipId, endedAt: null }, include: { practitioner: { select: { userId: true } } } }),
    ]);
    await this.notifications.notify({ userIds: trainers.map((a) => a.practitioner.userId).filter((u) => u !== client.userId), organizationId: t.orgId, type: 'fitness.workout_completed', params: { client: client.user.fullName, day: day.name }, data: { orgSlug: clock.slug, clientId: s.clientMembershipId } });
    return this.get(id);
  }

  // ------------------------------------------------------------------ history

  async list(q: ListSessionsQuery) {
    const t = requestContext.tenant();
    const subject = q.clientMembershipId ?? t.membershipId;
    if (!(await this.authz.allows('fitness.workout.read', { subjectMembershipId: subject }))) throw new AppError('NOT_FOUND');
    const limit = pageSize(q);
    const rows = await this.tenant.db.fitWorkoutSession.findMany({
      where: { AND: [{ clientMembershipId: subject }, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1,
      include: {
        day: { select: { name: true } },
        assignment: { select: { version: { select: { plan: { select: { id: true, name: true } } } } } },
        setLogs: { select: { repsDone: true, weightKg: true } },
      },
    });
    const page = toPage(rows, limit);
    return {
      data: page.data.map((s) => ({
        id: s.id, scheduledDate: ymd(s.scheduledDate), dayName: s.day.name, planName: s.assignment.version.plan.name, startedAt: s.startedAt, completedAt: s.completedAt, rpe: s.rpe,
        setCount: s.setLogs.length, volume: sessionVolume(s.setLogs.map((l) => ({ repsDone: l.repsDone, weightKg: num(l.weightKg) }))),
      })),
      meta: page.meta,
    };
  }
}
