import { Inject, Injectable } from '@nestjs/common';
import { addDays, CHECKIN_METRIC_KEYS, CHECKIN_METRIC_RANGES, weekEndOf, weekStartOf } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../../common/pagination.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../../../capabilities/activity/activity.service.js';
import { FilesService } from '../../../capabilities/files/files.service.js';
import { NotificationsService } from '../../../capabilities/notifications/notifications.service.js';
import { ProgressService } from '../../../capabilities/progress/progress.service.js';
import { AdherenceService } from '../nutrition/adherence.service.js';
import { orgClock } from '../workouts/assignments.service.js';
import { CheckinStateService } from './checkin-state.service.js';
import type { AddPhotoDto, CheckinCommentDto, ListCheckinsQuery, ReviewCheckinDto, SaveCheckinDto } from './checkins.dto.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));
const valid = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && ymd(asDate(s)) === s;
const KEYS = CHECKIN_METRIC_KEYS as readonly string[];

type CheckinRow = Awaited<ReturnType<CheckinsService['loadRow']>>;

@Injectable()
export class CheckinsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AdherenceService) private readonly adherence: AdherenceService,
    @Inject(CheckinStateService) private readonly state: CheckinStateService,
    @Inject(ProgressService) private readonly progress: ProgressService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ the client's own week

  private async resolveWeek(which: string) {
    const clock = await orgClock(this.tenant);
    const current = weekStartOf(clock.today, clock.weekStartsOn);
    if (which !== 'current' && which !== 'previous') throw new AppError('NOT_FOUND');
    const start = which === 'current' ? current : addDays(current, -7);
    return { clock, start, end: weekEndOf(start), isCurrent: which === 'current' };
  }

  private async lastMeasurements(subject: string) {
    const ids = await this.progress.metricIdsByKey([...CHECKIN_METRIC_KEYS]);
    const rows = await this.tenant.db.metricRecord.findMany({ where: { subjectMembershipId: subject, metricDefinitionId: { in: [...ids.values()] }, voidedAt: null }, orderBy: { recordedAt: 'desc' }, take: 100, include: { metric: { select: { key: true } } } });
    const out: Record<string, { value: number; at: Date }> = {};
    for (const r of rows) if (!(r.metric.key in out)) out[r.metric.key] = { value: num(r.value)!, at: r.recordedAt };
    return out;
  }

  /** The week's form for the signed-in client: their draft or submission, a preview of adherence, last known values. */
  async getWeek(which: string) {
    const me = requestContext.tenant().membershipId;
    const w = await this.resolveWeek(which);
    const existing = await this.tenant.db.fitCheckin.findFirst({ where: { clientMembershipId: me, weekStartDate: asDate(w.start) }, select: { id: true } });
    const standing = (await this.state.standings(w.clock.today, w.clock.weekStartsOn, [me])).get(me);
    const to = w.clock.today < w.end ? w.clock.today : w.end;
    const [checkin, workout, nutrition, last] = await Promise.all([
      existing ? this.get(existing.id) : null,
      this.adherence.workouts(me, w.start, to),
      this.adherence.nutrition(me, w.start, to),
      this.lastMeasurements(me),
    ]);
    return {
      week: { key: which, start: w.start, end: w.end }, today: w.clock.today, state: this.state.dueState(standing, w.clock.today, w.clock.weekStartsOn),
      checkin, preview: { workout, nutrition: { planned: nutrition.planned, logged: nutrition.logged, pct: nutrition.pct } }, lastMeasurements: Object.fromEntries(Object.entries(last).map(([k, v]) => [k, { value: v.value, at: v.at }])),
    };
  }

  private cleanMeasurements(input: Record<string, number | null>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!KEYS.includes(key)) throw new AppError('VALIDATION_FAILED', { fields: [{ field: `measurements.${key}`, rules: ['isKnownMeasurement'] }] });
      if (value === null) continue;
      const [min, max] = CHECKIN_METRIC_RANGES[key as (typeof CHECKIN_METRIC_KEYS)[number]];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.round(value * 10) / 10 !== value) {
        throw new AppError('VALIDATION_FAILED', { fields: [{ field: `measurements.${key}`, rules: ['isInRange'] }] });
      }
      out[key] = value;
    }
    return out;
  }

  /** Creates the draft for the week on first save; later saves update it. A submitted check-in is locked. */
  async saveWeek(which: string, dto: SaveCheckinDto) {
    const t = requestContext.tenant();
    const w = await this.resolveWeek(which);
    const existing = await this.tenant.db.fitCheckin.findFirst({ where: { clientMembershipId: t.membershipId, weekStartDate: asDate(w.start) } });
    if (existing && existing.status !== 'DRAFT') throw new AppError('CHECKIN_LOCKED');
    let measurements: Record<string, number> | undefined;
    if (dto.measurements) {
      const merged = { ...((existing?.draftMeasurements as Record<string, number> | null) ?? {}) } as Record<string, number | null>;
      for (const [k, v] of Object.entries(dto.measurements)) merged[k] = v;
      measurements = this.cleanMeasurements(merged);
    }
    const data = { clientNotes: dto.clientNotes === undefined ? undefined : dto.clientNotes || null, draftMeasurements: measurements };
    const saved = existing
      ? await this.tenant.db.fitCheckin.update({ where: { id: existing.id }, data })
      : await this.tenant.db.fitCheckin.create({ data: { organizationId: t.orgId, clientMembershipId: t.membershipId, weekStartDate: asDate(w.start), ...data } });
    return this.get(saved.id);
  }

  async submit(checkinId: string) {
    const t = requestContext.tenant();
    const c = await this.tenant.db.fitCheckin.findFirst({ where: { id: checkinId, clientMembershipId: t.membershipId } });
    if (!c) throw new AppError('NOT_FOUND');
    if (c.status !== 'DRAFT') throw new AppError('CHECKIN_LOCKED');
    const values = (c.draftMeasurements as Record<string, number> | null) ?? {};
    const keys = Object.keys(values);
    const photos = await this.tenant.db.fitProgressPhoto.count({ where: { checkinId } });
    if (keys.length === 0 && photos === 0) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'measurements', rules: ['atLeastOne'] }] });

    const clock = await orgClock(this.tenant);
    const start = ymd(c.weekStartDate);
    const end = weekEndOf(start);
    const to = clock.today < end ? clock.today : end;
    const [workout, nutrition, ids] = await Promise.all([this.adherence.workouts(t.membershipId, start, to), this.adherence.nutrition(t.membershipId, start, to), this.progress.metricIdsByKey(keys)]);
    const entries = keys.flatMap((key) => (ids.has(key) ? [{ metricId: ids.get(key)!, key, value: values[key]! }] : []));

    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitCheckin.update({ where: { id: checkinId }, data: { status: 'SUBMITTED', submittedAt: new Date(), workoutAdherencePct: workout.pct, nutritionAdherencePct: nutrition.pct } });
      await this.progress.recordBatchInTx(tx, t.membershipId, entries, { type: 'fit.checkin', id: checkinId });
      await this.activity.record({ entityType: 'fit_checkin', entityId: checkinId, verb: 'fitness.checkin_submitted', subjectMembershipId: t.membershipId }, tx);
      await this.audit.record({ action: 'fitness.checkin.submitted', targetType: 'fit_checkin', targetId: checkinId, metadata: { measurements: entries.length, photos } }, tx);
    });
    await this.progress.afterRecorded(t.membershipId, entries);

    const [me, trainers] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.memberAssignment.findMany({ where: { participantMembershipId: t.membershipId, endedAt: null }, include: { practitioner: { select: { userId: true } } } }),
    ]);
    await this.notifications.notify({ userIds: trainers.map((a) => a.practitioner.userId), organizationId: t.orgId, type: 'fitness.checkin_submitted', params: { client: me.user.fullName }, data: { orgSlug: clock.slug, checkinId } });
    return this.get(checkinId);
  }

  // ------------------------------------------------------------------ reading

  private async loadRow(id: string) {
    return this.tenant.db.fitCheckin.findFirst({
      where: { id },
      include: {
        client: { include: { user: { select: { fullName: true } } } },
        reviewer: { include: { user: { select: { fullName: true } } } },
        comments: { orderBy: { id: 'asc' }, include: { author: { include: { user: { select: { fullName: true } } } } } },
        photos: { orderBy: { id: 'asc' } },
      },
    });
  }

  /** A check-in the caller may read: their own (a draft is private to the client), or a submitted one of a client in reach. */
  private async readable(id: string): Promise<NonNullable<CheckinRow>> {
    const me = requestContext.tenant().membershipId;
    const c = await this.loadRow(id);
    if (!c || !(await this.authz.allows('fitness.checkin.read', { subjectMembershipId: c.clientMembershipId }))) throw new AppError('NOT_FOUND');
    if (c.status === 'DRAFT' && c.clientMembershipId !== me) throw new AppError('NOT_FOUND');
    return c;
  }

  private async measurementsOf(c: NonNullable<CheckinRow>): Promise<{ key: string; value: number; unit?: string }[]> {
    if (c.status === 'DRAFT') return Object.entries((c.draftMeasurements as Record<string, number> | null) ?? {}).map(([key, value]) => ({ key, value }));
    const rows = await this.tenant.db.metricRecord.findMany({ where: { sourceType: 'fit.checkin', sourceId: c.id, voidedAt: null }, include: { metric: { select: { key: true, unit: true } } } });
    return rows.map((r) => ({ key: r.metric.key, value: num(r.value)!, unit: r.metric.unit }));
  }

  private async toDto(c: NonNullable<CheckinRow>) {
    const canPhotos = await this.authz.allows('fitness.photo.read', { subjectMembershipId: c.clientMembershipId });
    const start = ymd(c.weekStartDate);
    return {
      id: c.id, clientMembershipId: c.clientMembershipId, clientName: c.client.user.fullName, week: { start, end: weekEndOf(start) }, status: c.status, clientNotes: c.clientNotes, submittedAt: c.submittedAt,
      adherence: { workoutPct: c.workoutAdherencePct, nutritionPct: c.nutritionAdherencePct }, measurements: await this.measurementsOf(c),
      photosHidden: !canPhotos, photos: canPhotos ? c.photos.map((p) => ({ id: p.id, fileId: p.fileId, angle: p.angle, kind: p.kind, takenOn: ymd(p.takenOn) })) : [],
      reviewedByName: c.reviewer?.user.fullName ?? null, reviewedAt: c.reviewedAt, feedback: c.trainerFeedback,
      comments: c.comments.map((m) => ({ id: m.id, authorMembershipId: m.authorMembershipId, authorName: m.author.user.fullName, body: m.body, createdAt: m.createdAt })),
    };
  }

  async get(id: string) {
    return this.toDto(await this.readable(id));
  }

  async list(q: ListCheckinsQuery) {
    const me = requestContext.tenant().membershipId;
    const limit = pageSize(q);
    const rows = await this.tenant.db.fitCheckin.findMany({
      where: { AND: [{ client: await this.authz.memberReadFilter('fitness.checkin.read') }, { OR: [{ status: { not: 'DRAFT' } }, { clientMembershipId: me }] }, q.clientMembershipId ? { clientMembershipId: q.clientMembershipId } : {}, q.status ? { status: q.status } : {}, cursorWhere(q.cursor, 'desc')] },
      orderBy: { id: 'desc' }, take: limit + 1, include: { client: { include: { user: { select: { fullName: true } } } }, photos: { select: { id: true } } },
    });
    const page = toPage(rows, limit);
    const ids = page.data.map((r) => r.id);
    const weights = ids.length ? await this.tenant.db.metricRecord.findMany({ where: { sourceType: 'fit.checkin', sourceId: { in: ids }, voidedAt: null, metric: { key: 'weight_kg' } }, select: { sourceId: true, value: true } }) : [];
    return {
      data: page.data.map((c) => ({
        id: c.id, clientMembershipId: c.clientMembershipId, clientName: c.client.user.fullName, weekStart: ymd(c.weekStartDate), status: c.status, submittedAt: c.submittedAt, workoutAdherencePct: c.workoutAdherencePct, nutritionAdherencePct: c.nutritionAdherencePct,
        weightKg: num(weights.find((w) => w.sourceId === c.id)?.value), photoCount: c.photos.length, reviewedAt: c.reviewedAt,
      })),
      meta: page.meta,
    };
  }

  // ------------------------------------------------------------------ review and discussion

  async review(id: string, dto: ReviewCheckinDto) {
    const t = requestContext.tenant();
    const c = await this.loadRow(id);
    if (!c || c.status === 'DRAFT' || !(await this.authz.allows('fitness.checkin.review', { subjectMembershipId: c.clientMembershipId }))) throw new AppError('NOT_FOUND');
    if (c.status !== 'SUBMITTED') throw new AppError('CONFLICT', { reason: 'already_reviewed' });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitCheckin.update({ where: { id }, data: { status: 'REVIEWED', reviewedByMembershipId: t.membershipId, reviewedAt: new Date(), trainerFeedback: dto.feedback || null } });
      await this.audit.record({ action: 'fitness.checkin.reviewed', targetType: 'fit_checkin', targetId: id, metadata: { clientMembershipId: c.clientMembershipId } }, tx);
      await this.activity.record({ entityType: 'fit_checkin', entityId: id, verb: 'fitness.checkin_reviewed', subjectMembershipId: c.clientMembershipId }, tx);
    });
    const [reviewer, client, clock] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.membership.findFirstOrThrow({ where: { id: c.clientMembershipId }, select: { userId: true } }),
      orgClock(this.tenant),
    ]);
    await this.notifications.notify({ userIds: [client.userId], organizationId: t.orgId, type: 'fitness.checkin_reviewed', params: { actor: reviewer.user.fullName }, data: { orgSlug: clock.slug, checkin: '1' } });
    return this.get(id);
  }

  async comment(id: string, dto: CheckinCommentDto) {
    const t = requestContext.tenant();
    const c = await this.readable(id);
    if (c.status === 'DRAFT') throw new AppError('CONFLICT', { reason: 'draft' });
    await this.tenant.db.fitCheckinComment.create({ data: { organizationId: t.orgId, checkinId: id, authorMembershipId: t.membershipId, body: dto.body } });
    const clock = await orgClock(this.tenant);
    const [author, client, trainers] = await Promise.all([
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.membership.findFirstOrThrow({ where: { id: c.clientMembershipId }, select: { userId: true } }),
      this.tenant.db.memberAssignment.findMany({ where: { participantMembershipId: c.clientMembershipId, endedAt: null }, include: { practitioner: { select: { userId: true } } } }),
    ]);
    const mine = t.membershipId === c.clientMembershipId;
    await this.notifications.notify({
      userIds: mine ? trainers.map((a) => a.practitioner.userId) : [client.userId], organizationId: t.orgId, type: 'fitness.checkin_comment', params: { actor: author.user.fullName },
      data: mine ? { orgSlug: clock.slug, checkinId: id } : { orgSlug: clock.slug, checkin: '1' },
    });
    return this.get(id);
  }

  /** Two check-ins of the same client side by side: measurement changes and (when allowed) photos by angle. */
  async compare(fromId: string, toId: string) {
    const [a, b] = [await this.readable(fromId), await this.readable(toId)];
    if (a.clientMembershipId !== b.clientMembershipId) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'to', rules: ['sameClient'] }] });
    const [da, db] = [await this.toDto(a), await this.toDto(b)];
    const keys = [...new Set([...da.measurements, ...db.measurements].map((m) => m.key))];
    const valueOf = (d: typeof da, key: string) => d.measurements.find((m) => m.key === key)?.value ?? null;
    const unitOf = (key: string) => [...da.measurements, ...db.measurements].find((m) => m.key === key)?.unit ?? null;
    return {
      from: da, to: db,
      changes: keys.map((key) => {
        const [x, y] = [valueOf(da, key), valueOf(db, key)];
        return { key, unit: unitOf(key), from: x, to: y, change: x !== null && y !== null ? Math.round((y - x) * 10) / 10 : null };
      }),
    };
  }

  // ------------------------------------------------------------------ photos

  async addPhoto(dto: AddPhotoDto) {
    const t = requestContext.tenant();
    const clock = await orgClock(this.tenant);
    const takenOn = dto.takenOn ?? clock.today;
    if (!valid(takenOn) || takenOn > clock.today) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'takenOn', rules: ['notInFuture'] }] });
    const file = await this.tenant.db.file.findFirst({ where: { id: dto.fileId, uploaderMembershipId: t.membershipId, status: 'READY', deletedAt: null, sensitivity: 'SENSITIVE', mimeType: { in: ['image/jpeg', 'image/png'] } } });
    if (!file) throw new AppError('NOT_FOUND');
    if (dto.kind === 'WEEKLY' !== Boolean(dto.checkinId)) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'checkinId', rules: [dto.kind === 'WEEKLY' ? 'isDefined' : 'isEmpty'] }] });
    let replaced: string | null = null;
    if (dto.checkinId) {
      const c = await this.tenant.db.fitCheckin.findFirst({ where: { id: dto.checkinId, clientMembershipId: t.membershipId } });
      if (!c) throw new AppError('NOT_FOUND');
      if (c.status !== 'DRAFT') throw new AppError('CHECKIN_LOCKED');
      const same = await this.tenant.db.fitProgressPhoto.findFirst({ where: { checkinId: c.id, angle: dto.angle } });
      if (same) replaced = same.fileId;
    }
    try {
      await this.tenant.db.$transaction(async (tx) => {
        if (replaced) await tx.fitProgressPhoto.deleteMany({ where: { fileId: replaced } });
        const created = await tx.fitProgressPhoto.create({ data: { organizationId: t.orgId, clientMembershipId: t.membershipId, fileId: dto.fileId, kind: dto.kind, angle: dto.angle, takenOn: asDate(takenOn), checkinId: dto.checkinId ?? null } });
        await this.audit.record({ action: 'fitness.photo.added', targetType: 'fit_progress_photo', targetId: created.id, metadata: { angle: dto.angle, kind: dto.kind, replaced: Boolean(replaced) } }, tx);
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') throw new AppError('CONFLICT', { reason: 'file_in_use' });
      throw err;
    }
    if (replaced) await this.files.remove(replaced);
    return dto.checkinId ? this.get(dto.checkinId) : this.listPhotos(t.membershipId);
  }

  async removePhoto(photoId: string): Promise<void> {
    const t = requestContext.tenant();
    const p = await this.tenant.db.fitProgressPhoto.findFirst({ where: { id: photoId, clientMembershipId: t.membershipId }, include: { checkin: { select: { status: true } } } });
    if (!p) throw new AppError('NOT_FOUND');
    if (p.checkin && p.checkin.status !== 'DRAFT') throw new AppError('CHECKIN_LOCKED');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.fitProgressPhoto.delete({ where: { id: photoId } });
      await this.audit.record({ action: 'fitness.photo.removed', targetType: 'fit_progress_photo', targetId: photoId, metadata: { angle: p.angle, kind: p.kind } }, tx);
    });
    await this.files.remove(p.fileId);
  }

  /** Photo metadata (never the image) of a client the caller may see photos of; the images go through the audited file endpoint. */
  async listPhotos(clientMembershipId: string) {
    const me = requestContext.tenant().membershipId;
    // the person must exist in THIS organization: reach rules alone say nothing about ids of other organizations
    if (!(await this.tenant.db.membership.findFirst({ where: { id: clientMembershipId }, select: { id: true } })) || !(await this.authz.allows('fitness.photo.read', { subjectMembershipId: clientMembershipId }))) throw new AppError('NOT_FOUND');
    const rows = await this.tenant.db.fitProgressPhoto.findMany({ where: { clientMembershipId }, orderBy: { id: 'desc' }, take: 200, include: { checkin: { select: { status: true, weekStartDate: true } } } });
    return rows
      .filter((p) => !(p.checkin?.status === 'DRAFT' && clientMembershipId !== me)) // drafts are private to the client
      .map((p) => ({ id: p.id, fileId: p.fileId, kind: p.kind, angle: p.angle, takenOn: ymd(p.takenOn), checkinId: p.checkinId, weekStart: p.checkin ? ymd(p.checkin.weekStartDate) : null }));
  }
}
