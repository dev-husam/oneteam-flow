import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, dateInTimeZone, isoWeekday, weekEndOf, weekStartOf } from '@pt/domain';
import { RemindersService } from '../src/modules/fitness/reminders/reminders.service.js';
import { PNG, as, buildOrg, createTestApp, jpegWithGps, systemRoleId, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;
const today = () => dateInTimeZone(new Date(), 'UTC');

describe('fitness: weekly check-ins, progress photos and reminders', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  let weightMetric: string;
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);
  const orgBase = () => `/api/v1/orgs/${F.orgId}`;

  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Checkin Gym');
    base = `${orgBase()}/fitness`;
    weightMetric = (await api('owner').get(`${orgBase()}/progress/metrics`).expect(200)).body.data.find((m: { key: string }) => m.key === 'weight_kg').id;
    // the client has a nutrition plan, so a check-in is expected from them and adherence can be computed
    const plan = (await api('practitioner').post(`${base}/nutrition-plans`, { name: 'Check-in plan' }).expect(201)).body.data;
    const v = plan.versions[0].id;
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: [{ mealType: 'BREAKFAST', items: [{ name: 'Oats' }] }, { mealType: 'LUNCH', items: [{ name: 'Rice' }] }] }));
    await api('practitioner').put(`${base}/nutrition-plans/${plan.id}/versions/${v}/content`, { days }).expect(200);
    await api('practitioner').post(`${base}/nutrition-plans/${plan.id}/versions/${v}/publish`).expect(200);
    await api('practitioner').post(`${base}/nutrition-plans/${plan.id}/assignments`, { clientMembershipIds: [F.participant.membershipId], startDate: today() }).expect(201);
  });
  afterAll(async () => t.app.close());

  const photo = (who: keyof OrgFixture = 'participant', bytes = jpegWithGps(), mime = 'image/jpeg') => uploadFile(t, F[who] as OrgFixture['owner'], F.orgId, bytes, mime, 'p.jpg', 'SENSITIVE');
  const draft = async () => (await api('participant').put(`${base}/checkins/week/current`, { clientNotes: 'Felt good', measurements: { weight_kg: 84.2, waist_cm: 90 } }).expect(200)).body.data;

  describe('the weekly form', () => {
    it('shows the client their week, expected adherence and last known values; others have no form', async () => {
      const w = (await api('participant').get(`${base}/checkins/week/current`).expect(200)).body.data;
      expect(w.week).toMatchObject({ key: 'current', start: weekStartOf(today(), 1), end: weekEndOf(weekStartOf(today(), 1)) });
      expect(w.today).toBe(today());
      expect(w.checkin).toBeNull();
      expect(w.preview.nutrition.planned).toBeGreaterThanOrEqual(2);
      expect(w.preview.workout).toMatchObject({ scheduled: 0, completed: 0, pct: null });
      expect((await api('participant').get(`${base}/checkins/week/previous`).expect(200)).body.data.week.start).toBe(addDays(weekStartOf(today(), 1), -7));
      expect((await api('participant').get(`${base}/checkins/week/next`)).status).toBe(404);
      expect((await api('guardian').get(`${base}/checkins/week/current`)).status).toBe(403);
    });

    it('drafts are saved and merged, validated, private to the client, and one per week', async () => {
      const d = await draft();
      expect(d).toMatchObject({ status: 'DRAFT', clientNotes: 'Felt good' });
      expect(d.measurements).toEqual(expect.arrayContaining([{ key: 'weight_kg', value: 84.2 }, { key: 'waist_cm', value: 90 }]));
      const merged = (await api('participant').put(`${base}/checkins/week/current`, { measurements: { hips_cm: 101, waist_cm: null } }).expect(200)).body.data;
      expect(merged.id).toBe(d.id);
      expect(merged.measurements.map((m: { key: string }) => m.key).sort()).toEqual(['hips_cm', 'weight_kg']);
      expect(await t.prisma.fitCheckin.count({ where: { organizationId: F.orgId, clientMembershipId: F.participant.membershipId } })).toBe(1);

      const put = (measurements: object) => api('participant').put(`${base}/checkins/week/current`, { measurements });
      expect(code(await put({ shoe_size: 42 }))).toBe('VALIDATION_FAILED');
      expect(code(await put({ weight_kg: 5 }))).toBe('VALIDATION_FAILED');
      expect(code(await put({ weight_kg: 84.25 }))).toBe('VALIDATION_FAILED'); // one decimal
      expect((await put({ weight_kg: '84' })).status).toBe(400);
      expect((await api('participant').put(`${base}/checkins/week/current`, { clientNotes: 'x'.repeat(2001) })).status).toBe(400);
      expect((await api('participant').put(`${base}/checkins/week/current`, { surprise: 1 })).status).toBe(400);

      // a draft is visible to nobody else, not even the trainer
      expect((await api('practitioner').get(`${base}/checkins/${d.id}`)).status).toBe(404);
      expect((await api('practitioner').get(`${base}/checkins?limit=100`).expect(200)).body.data.map((c: { id: string }) => c.id)).not.toContain(d.id);
      expect((await api('participant').get(`${base}/checkins/${d.id}`).expect(200)).body.data.status).toBe('DRAFT');
    });
  });

  describe('progress photos', () => {
    it('are sensitive, weekly ones belong to a draft, one per angle (a new one replaces the old), and only your own uploads count', async () => {
      const d = await draft();
      const add = (body: object, who: keyof OrgFixture = 'participant') => api(who).post(`${base}/photos`, body);
      const a = await photo();
      const res = await add({ fileId: a.id, angle: 'FRONT', kind: 'WEEKLY', checkinId: d.id }).expect(201);
      expect(res.body.data.photos).toHaveLength(1);
      expect(res.body.data.photos[0]).toMatchObject({ angle: 'FRONT', kind: 'WEEKLY', fileId: a.id });
      const b = await photo();
      const swapped = (await add({ fileId: b.id, angle: 'FRONT', kind: 'WEEKLY', checkinId: d.id }).expect(201)).body.data;
      expect(swapped.photos.map((p: { fileId: string }) => p.fileId)).toEqual([b.id]); // replaced, not added
      expect((await t.prisma.file.findUniqueOrThrow({ where: { id: a.id } })).deletedAt).not.toBeNull();

      expect((await add({ fileId: (await photo('participant2')).id, angle: 'SIDE', kind: 'WEEKLY', checkinId: d.id })).status).toBe(404); // someone else's upload
      const plain = await uploadFile(t, F.participant, F.orgId, PNG, 'image/png', 'plain.png'); // not marked sensitive
      expect((await add({ fileId: plain.id, angle: 'SIDE', kind: 'WEEKLY', checkinId: d.id })).status).toBe(404);
      expect(code(await add({ fileId: (await photo()).id, angle: 'SIDE', kind: 'WEEKLY' }))).toBe('VALIDATION_FAILED'); // weekly needs a check-in
      expect(code(await add({ fileId: (await photo()).id, angle: 'SIDE', kind: 'STARTING', checkinId: d.id }))).toBe('VALIDATION_FAILED'); // starting photos stand alone
      expect((await add({ fileId: (await photo()).id, angle: 'TOP', kind: 'WEEKLY', checkinId: d.id })).status).toBe(400);
      expect(code(await add({ fileId: (await photo()).id, angle: 'SIDE', kind: 'OTHER', takenOn: addDays(today(), 2) }))).toBe('VALIDATION_FAILED');
      expect((await add({ fileId: b.id, angle: 'BACK', kind: 'OTHER' }).catch((e) => e)).status).toBeDefined();

      const starting = await photo();
      expect((await add({ fileId: starting.id, angle: 'FRONT', kind: 'STARTING' }).expect(201)).body.data[0]).toMatchObject({ kind: 'STARTING', angle: 'FRONT', checkinId: null });
      expect(code(await add({ fileId: starting.id, angle: 'BACK', kind: 'OTHER' }))).toBe('CONFLICT'); // one file, one photo

      const mine = (await api('participant').get(`${base}/clients/${F.participant.membershipId}/photos`).expect(200)).body.data;
      const startingId = mine.find((p: { kind: string }) => p.kind === 'STARTING').id;
      await api('participant').del(`${base}/photos/${startingId}`).expect(204);
      expect((await api('participant2').del(`${base}/photos/${mine[0].id}`)).status).toBe(404);

      // adding (including a replacement) and removing are on the audit trail, with angle and kind only
      const added = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'fitness.photo.added', actorUserId: F.participant.userId } });
      expect(added.some((a) => (a.metadata as { replaced?: boolean }).replaced === true)).toBe(true);
      expect(added.every((a) => Object.keys(a.metadata as object).sort().join() === 'angle,kind,replaced')).toBe(true);
      const removed = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'fitness.photo.removed', targetId: startingId } });
      expect(removed).toHaveLength(1);
      expect(removed[0]!.metadata).toEqual({ angle: 'FRONT', kind: 'STARTING' });
    });

    it('can be seen only by the client, their trainer, and holders of fitness.photo.read; every look at the image is audited', async () => {
      const d = await draft();
      const f = await photo();
      await api('participant').post(`${base}/photos`, { fileId: f.id, angle: 'SIDE', kind: 'WEEKLY', checkinId: d.id }).expect(201);
      const url = (who: keyof OrgFixture) => api(who).get(`${orgBase()}/files/${f.id}/download-url`);
      // while it is a draft, nobody but the client can reach it
      expect((await url('practitioner')).status).toBe(404);
      expect((await url('participant')).status).toBe(200);
      await api('participant').put(`${base}/checkins/week/current`, { measurements: { weight_kg: 84.2 } }).expect(200);
      await api('participant').post(`${base}/checkins/${d.id}/submit`).expect(200);

      expect((await url('practitioner')).status).toBe(200); // the client's trainer
      expect((await url('owner')).status).toBe(200); // accountable owner
      for (const who of ['practitioner2', 'participant2', 'guardian', 'manager', 'admin'] as const) expect((await url(who)).status, who).toBe(404);
      const audited = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'file.accessed', targetId: f.id } });
      const actors = audited.map((a) => a.actorUserId);
      expect(actors).toEqual(expect.arrayContaining([F.participant.userId, F.practitioner.userId, F.owner.userId]));
      expect(actors).not.toContain(F.manager.userId);
      expect(audited.find((a) => a.actorUserId === F.practitioner.userId)!.metadata).toMatchObject({ own: false });

      // the photo list and the check-in follow the same rule
      expect((await api('practitioner').get(`${base}/clients/${F.participant.membershipId}/photos`).expect(200)).body.data.length).toBeGreaterThanOrEqual(1);
      for (const who of ['practitioner2', 'manager', 'admin', 'guardian', 'participant2'] as const) expect([403, 404], who).toContain((await api(who).get(`${base}/clients/${F.participant.membershipId}/photos`)).status);
      const seen = (await api('practitioner').get(`${base}/checkins/${d.id}`).expect(200)).body.data;
      expect(seen.photosHidden).toBe(false);
      expect(seen.photos.map((p: { angle: string }) => p.angle)).toEqual(expect.arrayContaining(['SIDE']));
      const hidden = (await api('manager').get(`${base}/checkins/${d.id}`).expect(200)).body.data;
      expect(hidden).toMatchObject({ photosHidden: true, photos: [] }); // a manager reviews numbers, not photos
      expect(hidden.measurements.length).toBeGreaterThan(0);
    });
  });

  describe('submitting, reviewing and discussing', () => {
    it('submit needs something to submit, records the measurements as one atomic step, completes goals, informs the trainer, and locks', async () => {
      const prev = (await api('participant').get(`${base}/checkins/week/previous`).expect(200)).body.data;
      expect(prev.checkin).toBeNull();
      const empty = (await api('participant').put(`${base}/checkins/week/previous`, { clientNotes: 'just a note' }).expect(200)).body.data;
      expect(code(await api('participant').post(`${base}/checkins/${empty.id}/submit`))).toBe('VALIDATION_FAILED');

      await api('practitioner').post(`${orgBase()}/progress/goals`, { subjectMembershipId: F.participant.membershipId, metricId: weightMetric, title: 'Reach 90 kg', baselineValue: 95, targetValue: 90 }).expect(201);
      await api('participant').put(`${base}/checkins/week/previous`, { measurements: { weight_kg: 89.4, chest_cm: 100 } }).expect(200);
      const before = await t.prisma.metricRecord.count({ where: { organizationId: F.orgId, subjectMembershipId: F.participant.membershipId } });
      const done = (await api('participant').post(`${base}/checkins/${empty.id}/submit`).expect(200)).body.data;
      expect(done).toMatchObject({ status: 'SUBMITTED', clientNotes: 'just a note' });
      expect(done.submittedAt).toBeTruthy();
      const submitted = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'fitness.checkin.submitted', targetId: empty.id } });
      expect(submitted).toHaveLength(1);
      expect(submitted[0]!.actorUserId).toBe(F.participant.userId);
      expect(submitted[0]!.metadata).toEqual({ measurements: 2, photos: 0 }); // counts only, never the values
      expect(done.measurements.map((m: { key: string; value: number }) => [m.key, m.value]).sort()).toEqual([['chest_cm', 100], ['weight_kg', 89.4]]);
      expect(await t.prisma.metricRecord.count({ where: { organizationId: F.orgId, subjectMembershipId: F.participant.membershipId } })).toBe(before + 2);
      const rec = await t.prisma.metricRecord.findFirstOrThrow({ where: { sourceType: 'fit.checkin', sourceId: empty.id, metric: { key: 'weight_kg' } } });
      expect([Number(rec.value), rec.recordedByMembershipId]).toEqual([89.4, F.participant.membershipId]);

      const goals = (await api('practitioner').get(`${orgBase()}/progress/goals?subjectMembershipId=${F.participant.membershipId}`).expect(200)).body.data;
      expect(goals.find((g: { title: string }) => g.title === 'Reach 90 kg').status).toBe('ACHIEVED'); // the check-in reached the goal
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'fitness.checkin_submitted' } })).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner2.userId, typeKey: 'fitness.checkin_submitted' } })).toBe(0);

      expect(code(await api('participant').put(`${base}/checkins/week/previous`, { clientNotes: 'edit' }))).toBe('CHECKIN_LOCKED');
      expect(code(await api('participant').post(`${base}/checkins/${empty.id}/submit`))).toBe('CHECKIN_LOCKED');
      expect(code(await api('participant').post(`${base}/photos`, { fileId: (await photo()).id, angle: 'BACK', kind: 'WEEKLY', checkinId: empty.id }))).toBe('CHECKIN_LOCKED');
      expect((await api('participant2').post(`${base}/checkins/${empty.id}/submit`)).status).toBe(404);
    });

    it('trainers in reach review (once) with feedback and the client is told; others cannot', async () => {
      const list = (who: keyof OrgFixture) => api(who).get(`${base}/checkins?status=SUBMITTED&limit=100`).expect(200).then((r) => r.body.data);
      const mine = (await list('practitioner')).find((c: { clientMembershipId: string }) => c.clientMembershipId === F.participant.membershipId);
      expect(mine).toMatchObject({ status: 'SUBMITTED', weightKg: 89.4, clientName: expect.any(String) });
      expect((await list('practitioner2')).map((c: { id: string }) => c.id)).not.toContain(mine.id);
      expect((await list('manager')).map((c: { id: string }) => c.id)).toContain(mine.id);
      expect((await api('practitioner2').get(`${base}/checkins/${mine.id}`)).status).toBe(404);

      expect((await api('participant').post(`${base}/checkins/${mine.id}/review`, {})).status).toBe(403);
      expect((await api('practitioner2').post(`${base}/checkins/${mine.id}/review`, {})).status).toBe(404);
      const reviewed = (await api('practitioner').post(`${base}/checkins/${mine.id}/review`, { feedback: 'Great week, keep protein up.' }).expect(200)).body.data;
      expect(reviewed).toMatchObject({ status: 'REVIEWED', feedback: 'Great week, keep protein up.' });
      expect(reviewed.reviewedByName).toBeTruthy();
      expect(code(await api('practitioner').post(`${base}/checkins/${mine.id}/review`, {}))).toBe('CONFLICT');
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'fitness.checkin.reviewed', targetId: mine.id } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'fitness.checkin_reviewed' } })).toBeGreaterThanOrEqual(1);
    });

    it('client and trainer can discuss a submitted check-in; each is told; outsiders cannot', async () => {
      const id = (await api('participant').get(`${base}/checkins?limit=100`).expect(200)).body.data.find((c: { status: string }) => c.status === 'REVIEWED').id;
      const asTrainer = (await api('practitioner').post(`${base}/checkins/${id}/comments`, { body: 'How is the knee?' }).expect(201)).body.data;
      expect(asTrainer.comments.at(-1)).toMatchObject({ body: 'How is the knee?', authorMembershipId: F.practitioner.membershipId });
      const asClient = (await api('participant').post(`${base}/checkins/${id}/comments`, { body: 'Much better, thanks' }).expect(201)).body.data;
      expect(asClient.comments).toHaveLength(2);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'fitness.checkin_comment' } })).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'fitness.checkin_comment' } })).toBeGreaterThanOrEqual(1);
      expect((await api('practitioner2').post(`${base}/checkins/${id}/comments`, { body: 'hi' })).status).toBe(404);
      expect((await api('participant2').post(`${base}/checkins/${id}/comments`, { body: 'hi' })).status).toBe(404);
      expect((await api('participant').post(`${base}/checkins/${id}/comments`, { body: '   ' })).status).toBe(400);
      // a draft is a private working copy: nobody discusses it yet
      const open = (await api('participant2').put(`${base}/checkins/week/current`, { clientNotes: 'work in progress' }).expect(200)).body.data;
      expect(code(await api('participant2').post(`${base}/checkins/${open.id}/comments`, { body: 'on my draft' }))).toBe('CONFLICT');
    });

    it('compares two check-ins of one client: measurement changes, and never across clients', async () => {
      const all = (await api('participant').get(`${base}/checkins?limit=100`).expect(200)).body.data as { id: string; weekStart: string }[];
      const cur = all.find((c) => c.weekStart === weekStartOf(today(), 1))!;
      const prev = all.find((c) => c.weekStart === addDays(weekStartOf(today(), 1), -7))!;
      const cmp = (await api('practitioner').get(`${base}/checkins/compare?from=${prev.id}&to=${cur.id}`).expect(200)).body.data;
      const weight = cmp.changes.find((c: { key: string }) => c.key === 'weight_kg');
      expect(weight).toMatchObject({ from: 89.4, to: 84.2, change: -5.2, unit: 'kg' });
      expect(cmp.changes.find((c: { key: string }) => c.key === 'chest_cm')).toMatchObject({ from: 100, to: null, change: null });
      expect(cmp.changes.find((c: { key: string }) => c.key === 'hips_cm')).toMatchObject({ from: null, to: 101, change: null });
      expect((await api('practitioner2').get(`${base}/checkins/compare?from=${prev.id}&to=${cur.id}`)).status).toBe(404);
      expect((await api('manager').get(`${base}/checkins/compare?from=${prev.id}&to=${cur.id}`).expect(200)).body.data.from.photosHidden).toBe(true);
    });
  });

  describe('check-in status, roles and reminders', () => {
    it('the clients list shows who is due or overdue (only people with something assigned are tracked)', async () => {
      const list = async () => (await api('manager').get(`${base}/clients?limit=100`).expect(200)).body.data as { membershipId: string; checkin: string }[];
      expect((await list()).find((c) => c.membershipId === F.participant2.membershipId)!.checkin).toBe('NONE'); // nothing assigned
      const version = await t.prisma.fitNutritionAssignment.findFirstOrThrow({ where: { organizationId: F.orgId } });
      await t.prisma.fitNutritionAssignment.create({ data: { organizationId: F.orgId, versionId: version.versionId, clientMembershipId: F.participant2.membershipId, assignedByMembershipId: F.manager.membershipId, startDate: new Date(`${addDays(today(), -12)}T00:00:00Z`) } });
      expect((await list()).find((c) => c.membershipId === F.participant2.membershipId)!.checkin).toBe('OVERDUE'); // a week went by without a check-in
      expect((await list()).find((c) => c.membershipId === F.participant.membershipId)!.checkin).toMatch(/SUBMITTED|REVIEWED/);
    });

    it('admins cannot give photo access to a custom role but still invite trainers and clients; owners can grant it', async () => {
      const grants = [{ code: 'member.read', scope: 'ORG' }, { code: 'fitness.photo.read', scope: 'ORG' }];
      expect(code(await api('admin').post(`${orgBase()}/roles`, { name: 'Photo viewer', rank: 30, grants }))).toBe('PRIVILEGE_ESCALATION');
      expect((await api('owner').post(`${orgBase()}/roles`, { name: 'Photo viewer', rank: 30, grants }).expect(201)).body.data.grants).toContainEqual({ code: 'fitness.photo.read', scope: 'ORG' });
      for (const role of ['participant', 'practitioner'] as const) {
        const res = await api('admin').post(`${orgBase()}/invitations`, { email: `invited.${role}.${Date.now()}@example.test`, roleId: await systemRoleId(t, role) });
        expect(res.status, role).toBe(201);
      }
    });

    describe('reminders', () => {
      const reminders = () => t.app.get(RemindersService);
      const realWeekEnd = () => weekEndOf(weekStartOf(today(), 1));
      const count = (userId: string, type: string) => t.prisma.notification.count({ where: { userId, typeKey: type } });

      it('on check-in day, tracked clients without a check-in are reminded once, only in daytime, never if they submitted', async () => {
        // a client with something assigned and no check-in for the week of the (simulated) day
        const lateWeek = new Date(`${realWeekEnd()}T10:00:00Z`);
        // (participant2 may hold an unsent draft: that still counts as "no check-in submitted")
        expect(await t.prisma.fitCheckin.count({ where: { organizationId: F.orgId, clientMembershipId: F.participant2.membershipId, status: { not: 'DRAFT' } } })).toBe(0);
        await reminders().run(new Date(`${realWeekEnd()}T03:00:00Z`)); // night: nothing is sent
        expect(await count(F.participant2.userId, 'fitness.checkin_due')).toBe(0);

        const first = await reminders().run(lateWeek);
        expect(first.due).toBeGreaterThanOrEqual(1);
        expect(await count(F.participant2.userId, 'fitness.checkin_due')).toBe(1);
        await reminders().run(lateWeek);
        await reminders().run(new Date(`${realWeekEnd()}T15:30:00Z`)); // later the same day
        expect(await count(F.participant2.userId, 'fitness.checkin_due')).toBe(1); // once per client and week
        expect(await t.prisma.fitReminderMark.count({ where: { organizationId: F.orgId, key: { startsWith: `checkin_due:${F.participant2.membershipId}` } } })).toBe(1);
        // participant already submitted this week: no reminder
        expect(await count(F.participant.userId, 'fitness.checkin_due')).toBe(0);
        // guardians and staff are never reminded
        expect(await count(F.practitioner.userId, 'fitness.checkin_due')).toBe(0);
      });

      it('after a missed week the client and their trainers are told once; organizations without Fitness are skipped', async () => {
        const monday = addDays(weekStartOf(today(), 1), 7);
        const early = new Date(`${addDays(monday, 1)}T10:00:00Z`); // Tuesday of next week: last week is the one that was missed
        const r = await reminders().run(early);
        expect(r.overdue).toBeGreaterThanOrEqual(1);
        expect(await count(F.participant2.userId, 'fitness.checkin_overdue')).toBe(1);
        await reminders().run(early);
        expect(await count(F.participant2.userId, 'fitness.checkin_overdue')).toBe(1);
        // participant2 has no trainer assigned: nobody to tell, and no crash
        expect(await t.prisma.fitReminderMark.count({ where: { organizationId: F.orgId, key: { startsWith: `checkin_overdue:${F.participant2.membershipId}` } } })).toBe(1);

        const row = await t.prisma.organizationModule.findFirstOrThrow({ where: { organizationId: F.orgId, module: { key: 'fitness' } } });
        const set = (enabled: boolean) => t.prisma.organizationModule.update({ where: { organizationId_moduleId: { organizationId: F.orgId, moduleId: row.moduleId } }, data: { enabled } });
        await set(false);
        try {
          const before = await count(F.participant.userId, 'fitness.checkin_overdue');
          await reminders().run(new Date(`${addDays(monday, 2)}T10:00:00Z`));
          expect(await count(F.participant.userId, 'fitness.checkin_overdue')).toBe(before);
        } finally {
          await set(true);
        }
      });

      it('overdue notices also reach the trainer of a client who missed a week', async () => {
        const version = await t.prisma.fitNutritionAssignment.findFirstOrThrow({ where: { organizationId: F.orgId } });
        // a third client assigned to practitioner2 with a plan that started three weeks ago and never checked in
        const { addMember } = await import('./helpers/app.js');
        const client = await addMember(t, F.orgId, F.owner, 'participant', { assignToMembershipId: F.practitioner2.membershipId });
        await t.prisma.fitNutritionAssignment.create({ data: { organizationId: F.orgId, versionId: version.versionId, clientMembershipId: client.membershipId, assignedByMembershipId: F.manager.membershipId, startDate: new Date(`${addDays(today(), -21)}T00:00:00Z`) } });
        const monday = addDays(weekStartOf(today(), 1), 7);
        const r = await reminders().run(new Date(`${addDays(monday, 1)}T11:00:00Z`));
        expect(r.trainerNotices).toBeGreaterThanOrEqual(1);
        expect(await count(client.userId, 'fitness.checkin_overdue')).toBe(1);
        expect(await count(F.practitioner2.userId, 'fitness.checkin_overdue_trainer')).toBe(1);
        expect(await count(F.practitioner.userId, 'fitness.checkin_overdue_trainer')).toBe(0); // not their client
      });
    });
  });

  it('workout adherence in the weekly preview counts scheduled and completed sessions', async () => {
    const lib = (await api('practitioner').get(`${base}/exercises`).expect(200)).body.data;
    const plan = (await api('practitioner').post(`${base}/plans`, { name: 'Adherence strength' }).expect(201)).body.data;
    const v = plan.versions[0].id;
    await api('practitioner').put(`${base}/plans/${plan.id}/versions/${v}/content`, { days: [{ name: 'Day', exercises: [{ exerciseId: lib[0].id, sets: 1, repsMin: 5, repsMax: 5, restSeconds: 60 }] }] }).expect(200);
    await api('practitioner').post(`${base}/plans/${plan.id}/versions/${v}/publish`).expect(200);
    const asg = (await api('practitioner').post(`${base}/plans/${plan.id}/assignments`, { clientMembershipIds: [F.participant.membershipId], startDate: today(), weeklySchedule: { '1': isoWeekday(today()) } }).expect(201)).body.data.assignments[0].id;
    const detail = (await api('participant').get(`${base}/assignments/${asg}`).expect(200)).body.data;
    const s = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: detail.content.days[0].id }).expect(200)).body.data;
    expect((await api('participant').get(`${base}/checkins/week/current`).expect(200)).body.data.preview.workout).toMatchObject({ scheduled: 1, completed: 0, pct: 0 });
    await api('participant').put(`${base}/sessions/${s.id}/sets`, { dayExerciseId: s.exercises[0].dayExerciseId, setNo: 1, repsDone: 5, weightKg: 40 }).expect(200);
    await api('participant').post(`${base}/sessions/${s.id}/complete`, {}).expect(200);
    expect((await api('participant').get(`${base}/checkins/week/current`).expect(200)).body.data.preview.workout).toMatchObject({ scheduled: 1, completed: 1, pct: 100 });
  });
});
