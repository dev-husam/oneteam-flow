import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, dateInTimeZone, isoWeekday } from '@pt/domain';
import { as, buildOrg, createTestApp, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;
const today = () => dateInTimeZone(new Date(), 'UTC');

describe('fitness module', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  let squat: string; // seeded exercise ids
  let bench: string;
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);

  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Fitness Gym');
    base = `/api/v1/orgs/${F.orgId}/fitness`;
    const list = (await api('practitioner').get(`${base}/exercises`).expect(200)).body.data;
    squat = list.find((e: { key: string }) => e.key === 'barbell_back_squat').id;
    bench = list.find((e: { key: string }) => e.key === 'barbell_bench_press').id;
  });
  afterAll(async () => t.app.close());

  const content = (exerciseId = squat) => ({
    notes: 'Linear progression',
    days: [
      { name: 'Lower', exercises: [{ exerciseId, sets: 3, repsMin: 5, repsMax: 8, targetWeightKg: 60, restSeconds: 120 }, { exerciseId: bench, sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90 }] },
      { name: 'Upper', exercises: [{ exerciseId: bench, sets: 4, repsMin: 6, repsMax: 8, restSeconds: 90, supersetGroup: 1 }] },
    ],
  });

  /** Creates, fills and publishes a plan as `who`; returns ids. */
  const publishedPlan = async (who: keyof OrgFixture = 'practitioner', name = 'Strength base') => {
    const plan = (await api(who).post(`${base}/plans`, { name }).expect(201)).body.data;
    const versionId = plan.versions[0].id as string;
    await api(who).put(`${base}/plans/${plan.id}/versions/${versionId}/content`, content()).expect(200);
    await api(who).post(`${base}/plans/${plan.id}/versions/${versionId}/publish`).expect(200);
    return { planId: plan.id as string, versionId };
  };
  const assign = (who: keyof OrgFixture, planId: string, body: object) =>
    api(who).post(`${base}/plans/${planId}/assignments`, { startDate: today(), weeklySchedule: { '1': isoWeekday(today()), '2': isoWeekday(addDays(today(), 2)) }, ...body });

  describe('module and permissions', () => {
    it('navigation and permissions: staff build plans, clients log workouts, guardians get nothing', async () => {
      expect((await api('participant').post(`${base}/plans`, { name: 'Nope' })).status).toBe(403);
      expect((await api('participant').get(`${base}/plans`)).status).toBe(403);
      for (const path of ['exercises', 'clients', 'plans', 'assignments', 'workouts/today', 'sessions']) expect((await api('guardian').get(`${base}/${path}`)).status, path).toBe(403);
      expect((await api('practitioner').get(`${base}/workouts/today`).expect(200)).body.data.date).toBe(today()); // staff may train too
    });

    it('a disabled module answers MODULE_NOT_ENABLED everywhere and disappears from navigation and system measurements', async () => {
      const row = await t.prisma.organizationModule.findFirstOrThrow({ where: { organizationId: F.orgId, module: { key: 'fitness' } } });
      const set = (enabled: boolean) => t.prisma.organizationModule.update({ where: { organizationId_moduleId: { organizationId: F.orgId, moduleId: row.moduleId } }, data: { enabled } });
      const metrics = async () => (await api('owner').get(`/api/v1/orgs/${F.orgId}/progress/metrics`).expect(200)).body.data.map((m: { key: string }) => m.key);
      expect(await metrics()).toContain('weight_kg');
      await set(false);
      try {
        for (const path of ['exercises', 'clients', 'plans', 'assignments', 'workouts/today']) {
          const res = await api('owner').get(`${base}/${path}`);
          expect([res.status, code(res)], path).toEqual([403, 'MODULE_NOT_ENABLED']);
        }
        const ctx = (await api('owner').get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data;
        expect(ctx.navigation.map((n: { key: string }) => n.key)).not.toContain('plans');
        expect(await metrics()).not.toContain('weight_kg');
      } finally {
        await set(true);
      }
      expect((await api('owner').get(`${base}/exercises`)).status).toBe(200);
    });
  });

  describe('exercise library', () => {
    it('ships a bilingual seeded library that can be searched in either language and filtered', async () => {
      const all = (await api('participant').get(`${base}/exercises`).expect(200)).body.data;
      expect(all.length).toBeGreaterThanOrEqual(40);
      expect(all.every((e: { name: { en: string; ar: string }; system: boolean }) => e.name.en && e.name.ar && e.system)).toBe(true);
      const arabic = (await api('participant').get(`${base}/exercises?q=${encodeURIComponent('سكوات')}`).expect(200)).body.data;
      expect(arabic.map((e: { key: string }) => e.key)).toContain('barbell_back_squat');
      const english = (await api('participant').get(`${base}/exercises?q=squat`).expect(200)).body.data;
      expect(english.length).toBeGreaterThan(1);
      const chest = (await api('participant').get(`${base}/exercises?muscleGroup=CHEST`).expect(200)).body.data;
      expect(chest.every((e: { muscleGroup: string }) => e.muscleGroup === 'CHEST')).toBe(true);
      expect((await api('participant').get(`${base}/exercises?muscleGroup=ARMS`)).status).toBe(400);
    });

    it('organizations add, edit and archive their own exercises; the system library is read-only', async () => {
      expect((await api('participant').post(`${base}/exercises`, { name: 'Mine', muscleGroup: 'CORE', equipment: 'BODYWEIGHT' })).status).toBe(403);
      expect((await api('practitioner').post(`${base}/exercises`, { name: 'Bad link', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', videoUrl: 'http://insecure.example/x' })).status).toBe(400);
      const created = (await api('practitioner').post(`${base}/exercises`, { name: 'Sandbag carry', nameAr: 'حمل كيس الرمل', muscleGroup: 'FULL_BODY', equipment: 'OTHER', videoUrl: 'https://videos.example/sandbag' }).expect(201)).body.data;
      expect(created).toMatchObject({ system: false, name: { en: 'Sandbag carry', ar: 'حمل كيس الرمل' }, key: null });
      const edited = (await api('manager').patch(`${base}/exercises/${created.id}`, { name: 'Sandbag carry (heavy)' }).expect(200)).body.data;
      expect(edited.name).toEqual({ en: 'Sandbag carry (heavy)', ar: 'حمل كيس الرمل' });
      expect((await api('practitioner').patch(`${base}/exercises/${squat}`, { name: 'Hacked' })).status).toBe(403);
      expect((await api('practitioner').del(`${base}/exercises/${squat}`)).status).toBe(403);
      await api('practitioner').del(`${base}/exercises/${created.id}`).expect(204);
      const names = (await api('participant').get(`${base}/exercises`).expect(200)).body.data.map((e: { id: string }) => e.id);
      expect(names).not.toContain(created.id);
      const withArchived = (await api('manager').get(`${base}/exercises?archived=true`).expect(200)).body.data.map((e: { id: string }) => e.id);
      expect(withArchived).toContain(created.id);
    });
  });

  describe('client profiles', () => {
    it('trainers see their own clients, managers all, clients only themselves', async () => {
      const ids = (who: keyof OrgFixture) => api(who).get(`${base}/clients`).expect(200).then((r) => r.body.data.map((c: { membershipId: string }) => c.membershipId));
      expect(await ids('practitioner')).toEqual([F.participant.membershipId]);
      expect(await ids('practitioner2')).toEqual([]);
      expect([...(await ids('manager'))].sort()).toEqual([F.participant.membershipId, F.participant2.membershipId].sort());
      expect(await ids('participant')).toEqual([F.participant.membershipId]);
      expect((await api('practitioner2').get(`${base}/clients/${F.participant.membershipId}`)).status).toBe(404);
      expect((await api('participant').get(`${base}/clients/${F.participant2.membershipId}`)).status).toBe(404);
      expect((await api('practitioner').get(`${base}/clients/${F.participant.membershipId}`).expect(200)).body.data).toMatchObject({ fullName: expect.any(String), profile: null, stats: { completedLast30Days: 0 } });
    });

    it('profile edits: encrypted health notes, adult clients only, audited by field name, starting weight recorded once', async () => {
      const path = `${base}/clients/${F.participant.membershipId}/profile`;
      const saved = await api('participant').put(path, { heightCm: 178.5, goalType: 'MUSCLE_GAIN', activityLevel: 'MODERATE', goalsText: 'Add 5 kg of muscle', injuriesNotes: 'Left knee surgery 2024', dateOfBirth: '1992-03-14', startingWeightKg: 82.4 }).expect(200);
      expect(saved.body.data.profile).toMatchObject({ heightCm: 178.5, goalType: 'MUSCLE_GAIN', injuriesNotes: 'Left knee surgery 2024', dateOfBirth: '1992-03-14' });
      expect(saved.body.data.startingWeightKg).toBe(82.4);

      const row = await t.prisma.fitClientProfile.findFirstOrThrow({ where: { organizationId: F.orgId, membershipId: F.participant.membershipId } });
      expect(row.injuriesNotesEnc).toBeTruthy();
      expect(row.injuriesNotesEnc).not.toContain('knee'); // never stored in clear text
      const audit = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'fitness.client_profile.updated', targetId: F.participant.membershipId } });
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0]!.metadata)).not.toContain('knee');

      // the trainer assigned to the client may update; another trainer cannot even see them
      await api('practitioner').put(path, { goalType: 'STRENGTH' }).expect(200);
      expect((await api('practitioner2').put(path, { goalType: 'FAT_LOSS' })).status).toBe(404);
      // nulls clear, absent fields stay
      const cleared = (await api('participant').put(path, { goalsText: null }).expect(200)).body.data.profile;
      expect(cleared).toMatchObject({ goalsText: null, heightCm: 178.5, goalType: 'STRENGTH' });

      // a second starting weight does not create a second onboarding record
      await api('participant').put(path, { startingWeightKg: 90 }).expect(200);
      expect(await t.prisma.metricRecord.count({ where: { organizationId: F.orgId, subjectMembershipId: F.participant.membershipId, sourceType: 'fit.onboarding' } })).toBe(1);
    });

    it('rejects minors and impossible values', async () => {
      const path = `${base}/clients/${F.participant2.membershipId}/profile`;
      const year = new Date().getUTCFullYear() - 16;
      expect(code(await api('participant2').put(path, { dateOfBirth: `${year}-01-01` }))).toBe('VALIDATION_FAILED');
      expect((await api('participant2').put(path, { dateOfBirth: '1990-02-31' })).status).toBe(400);
      expect((await api('participant2').put(path, { heightCm: 20 })).status).toBe(400);
      expect((await api('participant2').put(path, { goalType: 'BULK' })).status).toBe(400);
      expect((await api('participant2').put(path, { unknown: 1 })).status).toBe(400);
    });
  });

  describe('workout plans: versioning', () => {
    it('a draft is editable and validated; publishing locks the version; changes become a new version', async () => {
      const plan = (await api('practitioner').post(`${base}/plans`, { name: 'Draft plan' }).expect(201)).body.data;
      expect(plan).toMatchObject({ name: 'Draft plan', currentVersion: null, draftVersionId: plan.versions[0].id, archived: false });
      const v1 = plan.versions[0].id;
      const path = `${base}/plans/${plan.id}/versions/${v1}`;

      // an empty plan cannot be published
      expect(code(await api('practitioner').post(`${path}/publish`))).toBe('PLAN_INVALID');
      // issues are reported with their paths
      const bad = await api('practitioner').put(`${path}/content`, { days: [{ name: 'Day', exercises: [{ exerciseId: squat, sets: 3, repsMin: 12, repsMax: 8, restSeconds: 60 }] }] });
      expect(code(bad)).toBe('PLAN_INVALID');
      expect(bad.body.error.details.issues).toContainEqual({ path: 'days[0].exercises[0].repsMax', rule: 'repsOrder' });
      const ghost = await api('practitioner').put(`${path}/content`, { days: [{ name: 'Day', exercises: [{ exerciseId: '00000000-0000-7000-8000-000000000000', sets: 3, repsMin: 8, repsMax: 10, restSeconds: 60 }] }] });
      expect(ghost.body.error.details.issues).toContainEqual({ path: 'days[0].exercises[0].exerciseId', rule: 'exerciseUnavailable' });
      expect((await api('practitioner').put(`${path}/content`, { days: [{ name: 'Day', exercises: [{ exerciseId: squat, sets: 'three' }] }] })).status).toBe(400);

      // a valid draft saves (replacing what was there) and reads back in order
      await api('practitioner').put(`${path}/content`, content()).expect(200);
      const saved = (await api('practitioner').put(`${path}/content`, content()).expect(200)).body.data;
      expect(saved.days.map((d: { name: string }) => d.name)).toEqual(['Lower', 'Upper']);
      expect(saved.days[0].exercises.map((e: { exercise: { key: string } }) => e.exercise.key)).toEqual(['barbell_back_squat', 'barbell_bench_press']);
      expect(saved.days[0].exercises[0]).toMatchObject({ sets: 3, repsMin: 5, repsMax: 8, targetWeightKg: 60, restSeconds: 120 });
      expect(await t.prisma.fitWorkoutDay.count({ where: { versionId: v1 } })).toBe(2); // replaced, not appended

      const published = (await api('practitioner').post(`${path}/publish`).expect(200)).body.data;
      expect(published.currentVersion).toMatchObject({ id: v1, versionNo: 1, dayCount: 2 });
      expect(published.draftVersionId).toBeNull();
      expect(code(await api('practitioner').put(`${path}/content`, content()))).toBe('PLAN_VERSION_LOCKED');
      expect(code(await api('practitioner').post(`${path}/publish`))).toBe('PLAN_VERSION_LOCKED');
      expect(code(await api('practitioner').del(path))).toBe('PLAN_VERSION_LOCKED');

      // a change = a new draft copied from the current version; only one draft at a time
      const draft = (await api('practitioner').post(`${base}/plans/${plan.id}/versions`).expect(201)).body.data;
      expect(draft).toMatchObject({ versionNo: 2, published: false });
      expect(draft.days).toHaveLength(2);
      expect(code(await api('practitioner').post(`${base}/plans/${plan.id}/versions`))).toBe('CONFLICT');
      const changed = content();
      changed.days[0]!.name = 'Lower (heavy)';
      await api('practitioner').put(`${base}/plans/${plan.id}/versions/${draft.id}/content`, changed).expect(200);
      await api('practitioner').post(`${base}/plans/${plan.id}/versions/${draft.id}/publish`).expect(200);
      // version 1 is untouched, version 2 is current
      expect((await api('practitioner').get(`${path}`).expect(200)).body.data.days[0].name).toBe('Lower');
      const detail = (await api('practitioner').get(`${base}/plans/${plan.id}`).expect(200)).body.data;
      expect(detail.currentVersion.versionNo).toBe(2);
      expect(detail.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([1, 2]);

      // a draft can be discarded, a never-published first draft cannot
      const d3 = (await api('practitioner').post(`${base}/plans/${plan.id}/versions`).expect(201)).body.data;
      await api('practitioner').del(`${base}/plans/${plan.id}/versions/${d3.id}`).expect(204);
      const fresh = (await api('practitioner').post(`${base}/plans`, { name: 'Only draft' }).expect(201)).body.data;
      expect(code(await api('practitioner').del(`${base}/plans/${fresh.id}/versions/${fresh.versions[0].id}`))).toBe('CONFLICT');
    });

    it('plans are private to their creator under OWN scope; managers see everything; archived plans leave the list', async () => {
      const { planId } = await publishedPlan('practitioner', 'Visible to manager');
      expect((await api('practitioner2').get(`${base}/plans/${planId}`)).status).toBe(404);
      expect((await api('practitioner2').get(`${base}/plans`).expect(200)).body.data.map((p: { id: string }) => p.id)).not.toContain(planId);
      expect((await api('manager').get(`${base}/plans/${planId}`).expect(200)).body.data.name).toBe('Visible to manager');
      expect((await api('practitioner2').patch(`${base}/plans/${planId}`, { name: 'Hijack' })).status).toBe(404);
      await api('manager').patch(`${base}/plans/${planId}`, { name: 'Renamed by manager' }).expect(200);
      await api('practitioner').del(`${base}/plans/${planId}`).expect(204);
      expect((await api('practitioner').get(`${base}/plans`).expect(200)).body.data.map((p: { id: string }) => p.id)).not.toContain(planId);
      expect((await api('practitioner').get(`${base}/plans?archived=true`).expect(200)).body.data.map((p: { id: string }) => p.id)).toContain(planId);
    });
  });

  describe('assigning plans', () => {
    it('assigns one published version to several clients at once, notifies them, and records who did it', async () => {
      const { planId, versionId } = await publishedPlan('manager', 'Team plan');
      const res = await assign('manager', planId, { clientMembershipIds: [F.participant.membershipId, F.participant2.membershipId] });
      expect(res.status).toBe(201);
      expect(res.body.data.assignments).toHaveLength(2);
      const rows = await t.prisma.fitWorkoutAssignment.findMany({ where: { organizationId: F.orgId, batchId: res.body.data.batchId } });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.versionId === versionId && r.assignedByMembershipId === F.manager.membershipId && r.status === 'ACTIVE')).toBe(true);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'fitness.workout_assigned' } })).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'fitness.plan.assigned', targetId: planId } })).toBe(1);
    });

    it('is pinned to the version assigned: publishing a new version later changes nothing for existing clients', async () => {
      const { planId, versionId } = await publishedPlan('practitioner', 'Pinned plan');
      const asg = (await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }).expect(201)).body.data.assignments[0].id;
      const draft = (await api('practitioner').post(`${base}/plans/${planId}/versions`).expect(201)).body.data;
      const changed = content();
      changed.days = [{ name: 'Completely new', exercises: changed.days[0]!.exercises }];
      await api('practitioner').put(`${base}/plans/${planId}/versions/${draft.id}/content`, changed).expect(200);
      await api('practitioner').post(`${base}/plans/${planId}/versions/${draft.id}/publish`).expect(200);
      const seen = (await api('participant').get(`${base}/assignments/${asg}`).expect(200)).body.data;
      expect(seen.versionId).toBe(versionId);
      expect(seen.content.days.map((d: { name: string }) => d.name)).toEqual(['Lower', 'Upper']);
    });

    it('expands groups (skipping members out of reach) and refuses named clients out of reach for the whole request', async () => {
      const { planId } = await publishedPlan('practitioner', 'Group plan');
      const group = (await api('manager').post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'Class' }).expect(201)).body.data.id;
      for (const m of [F.participant, F.participant2]) await api('manager').post(`/api/v1/orgs/${F.orgId}/groups/${group}/members`, { membershipId: m.membershipId }).expect(200);
      const ownGroup = (await api('practitioner').post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'My class' }).expect(201)).body.data.id;
      for (const m of [F.participant, F.participant2]) await api('manager').post(`/api/v1/orgs/${F.orgId}/groups/${ownGroup}/members`, { membershipId: m.membershipId }).expect(200);

      const viaGroup = await assign('practitioner', planId, { groupIds: [ownGroup] }).expect(201);
      expect(viaGroup.body.data.assignments.map((a: { clientMembershipId: string }) => a.clientMembershipId)).toEqual([F.participant.membershipId]);
      expect(viaGroup.body.data.skipped).toBe(1); // participant2 is not this trainer's client
      expect((await assign('practitioner', planId, { groupIds: [group] })).status).toBe(404); // someone else's group

      const before = await t.prisma.fitWorkoutAssignment.count({ where: { organizationId: F.orgId } });
      expect((await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId, F.participant2.membershipId] })).status).toBe(404);
      expect(await t.prisma.fitWorkoutAssignment.count({ where: { organizationId: F.orgId } })).toBe(before); // all or nothing
    });

    it('validates the plan, schedule and dates; only staff with assign rights can assign', async () => {
      const { planId } = await publishedPlan('practitioner', 'Rules plan');
      const clients = { clientMembershipIds: [F.participant.membershipId] };
      expect((await assign('participant', planId, clients)).status).toBe(403);
      expect(code(await assign('practitioner', planId, { ...clients, startDate: addDays(today(), -1) }))).toBe('VALIDATION_FAILED');
      expect(code(await assign('practitioner', planId, { ...clients, endDate: addDays(today(), -3) }))).toBe('VALIDATION_FAILED');
      expect(code(await assign('practitioner', planId, { ...clients, weeklySchedule: { '1': 1, '2': 1 } }))).toBe('VALIDATION_FAILED'); // two days, one weekday
      expect(code(await assign('practitioner', planId, { ...clients, weeklySchedule: { '7': 1 } }))).toBe('VALIDATION_FAILED'); // no such day
      expect(code(await assign('practitioner', planId, { ...clients, weeklySchedule: {} }))).toBe('VALIDATION_FAILED');
      expect(code(await assign('practitioner', planId, { clientMembershipIds: [] }))).toBe('VALIDATION_FAILED');
      expect((await assign('practitioner', planId, { ...clients, versionId: '00000000-0000-7000-8000-000000000000' })).status).toBe(404);

      const draftOnly = (await api('practitioner').post(`${base}/plans`, { name: 'Unpublished' }).expect(201)).body.data;
      expect(code(await assign('practitioner', draftOnly.id, clients))).toBe('PLAN_INVALID');
      await api('practitioner').del(`${base}/plans/${planId}`).expect(204);
      expect(code(await assign('practitioner', planId, clients))).toBe('PLAN_INVALID'); // archived
    });

    it('lists and shows assignments by reach, and cancelling keeps the history', async () => {
      const { planId } = await publishedPlan('practitioner', 'Cancel me');
      const asg = (await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }).expect(201)).body.data.assignments[0].id;
      const ids = (who: keyof OrgFixture) => api(who).get(`${base}/assignments?limit=100`).expect(200).then((r) => r.body.data.map((a: { id: string }) => a.id));
      expect(await ids('participant')).toContain(asg);
      expect(await ids('practitioner')).toContain(asg);
      expect(await ids('manager')).toContain(asg);
      expect(await ids('practitioner2')).not.toContain(asg);
      expect(await ids('participant2')).not.toContain(asg);
      expect((await api('practitioner2').get(`${base}/assignments/${asg}`)).status).toBe(404);
      expect((await api('participant').post(`${base}/assignments/${asg}/cancel`)).status).toBe(403);
      expect((await api('practitioner2').post(`${base}/assignments/${asg}/cancel`)).status).toBe(404);
      await api('practitioner').post(`${base}/assignments/${asg}/cancel`).expect(204);
      const shown = (await api('participant').get(`${base}/assignments/${asg}`).expect(200)).body.data;
      expect(shown).toMatchObject({ status: 'CANCELLED', state: 'CANCELLED' });
      const todayView = (await api('participant').get(`${base}/workouts/today`).expect(200)).body.data;
      expect(todayView.assignments.map((a: { assignmentId: string }) => a.assignmentId)).not.toContain(asg);
    });
  });

  describe('logging workouts', () => {
    let asg: string;
    let lower: string;
    let upper: string;
    let squatSlot: string; // day exercise id of the squat in "Lower"

    beforeAll(async () => {
      const { planId } = await publishedPlan('practitioner', 'Logging plan');
      asg = (await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }).expect(201)).body.data.assignments[0].id;
      const detail = (await api('participant').get(`${base}/assignments/${asg}`).expect(200)).body.data;
      lower = detail.content.days[0].id;
      upper = detail.content.days[1].id;
      squatSlot = detail.content.days[0].exercises[0].id;
    });

    it('today shows what is scheduled for the client, the coming days, and every day they may do anytime', async () => {
      const v = (await api('participant').get(`${base}/workouts/today`).expect(200)).body.data;
      expect(v.date).toBe(today());
      const mine = v.today.filter((x: { assignmentId: string }) => x.assignmentId === asg);
      expect(mine.map((x: { dayName: string }) => x.dayName)).toEqual(['Lower']); // day 1 is scheduled for today
      expect(mine[0]).toMatchObject({ planName: 'Logging plan', exerciseCount: 2, session: null });
      const plan = v.assignments.find((a: { assignmentId: string }) => a.assignmentId === asg);
      expect(plan.days.map((d: { name: string }) => d.name)).toEqual(['Lower', 'Upper']);
      expect(v.upcoming.flatMap((d: { items: { assignmentId: string; dayName: string }[] }) => d.items).filter((i: { assignmentId: string }) => i.assignmentId === asg).map((i: { dayName: string }) => i.dayName)).toContain('Upper');
      // someone else never sees this assignment
      const other = (await api('participant2').get(`${base}/workouts/today`).expect(200)).body.data;
      expect(other.today.map((x: { assignmentId: string }) => x.assignmentId)).not.toContain(asg);
      expect(other.assignments.map((x: { assignmentId: string }) => x.assignmentId)).not.toContain(asg);
    });

    it('starting a session is idempotent per assignment, day and date, and only for your own, current, real days', async () => {
      const a = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower }).expect(200)).body.data;
      const b = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower }).expect(200)).body.data;
      expect(b.id).toBe(a.id);
      expect(a).toMatchObject({ scheduledDate: today(), completedAt: null, editable: true, dayName: 'Lower', planName: 'Logging plan' });
      expect(a.exercises).toHaveLength(2);
      expect(await t.prisma.fitWorkoutSession.count({ where: { assignmentId: asg, dayId: lower } })).toBe(1);

      expect(code(await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower, scheduledDate: addDays(today(), 1) }))).toBe('VALIDATION_FAILED'); // future
      expect(code(await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower, scheduledDate: addDays(today(), -1) }))).toBe('VALIDATION_FAILED'); // before the plan started
      expect((await api('participant2').post(`${base}/sessions`, { assignmentId: asg, dayId: lower })).status).toBe(404); // not their assignment
      expect((await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: '00000000-0000-7000-8000-000000000000' })).status).toBe(404);
      expect((await api('practitioner').post(`${base}/sessions`, { assignmentId: asg, dayId: lower })).status).toBe(404); // a trainer cannot train as the client
    });

    it('sets are logged, corrected and removed; only the client can, and only the day’s own exercises', async () => {
      const s = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower }).expect(200)).body.data;
      const put = (body: object, who: keyof OrgFixture = 'participant') => api(who).put(`${base}/sessions/${s.id}/sets`, body);
      await put({ dayExerciseId: squatSlot, setNo: 1, repsDone: 8, weightKg: 60 }).expect(200);
      await put({ dayExerciseId: squatSlot, setNo: 2, repsDone: 6, weightKg: 62.5 }).expect(200);
      const fixed = (await put({ dayExerciseId: squatSlot, setNo: 1, repsDone: 7, weightKg: 60 }).expect(200)).body.data; // same set, corrected
      expect(fixed.exercises[0].logged).toEqual([{ setNo: 1, repsDone: 7, weightKg: 60 }, { setNo: 2, repsDone: 6, weightKg: 62.5 }]);
      expect(fixed.volume).toBe(7 * 60 + 6 * 62.5);
      expect(await t.prisma.fitWorkoutSetLog.count({ where: { sessionId: s.id } })).toBe(2);

      expect((await put({ dayExerciseId: squatSlot, setNo: 3, repsDone: 5 }, 'practitioner')).status).toBe(404);
      expect((await put({ dayExerciseId: squatSlot, setNo: 3, repsDone: 5 }, 'participant2')).status).toBe(404);
      expect((await put({ dayExerciseId: '00000000-0000-7000-8000-000000000000', setNo: 1, repsDone: 5 })).status).toBe(404);
      expect((await put({ dayExerciseId: squatSlot, setNo: 0, repsDone: 5 })).status).toBe(400);
      expect((await put({ dayExerciseId: squatSlot, setNo: 1, repsDone: -1 })).status).toBe(400);
      expect((await put({ dayExerciseId: squatSlot, setNo: 1, repsDone: 5, weightKg: 5000 })).status).toBe(400);

      const removed = (await api('participant').del(`${base}/sessions/${s.id}/sets/${squatSlot}/2`).expect(200)).body.data;
      expect(removed.exercises[0].logged).toHaveLength(1);
    });

    it('finishing needs at least one set, closes the session, and tells the client’s trainers (not other trainers)', async () => {
      const s = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: upper }).expect(200)).body.data;
      expect(code(await api('participant').post(`${base}/sessions/${s.id}/complete`, { rpe: 7 }))).toBe('VALIDATION_FAILED');
      const slot = s.exercises[0].dayExerciseId;
      await api('participant').put(`${base}/sessions/${s.id}/sets`, { dayExerciseId: slot, setNo: 1, repsDone: 8, weightKg: 70 }).expect(200);
      expect((await api('participant').post(`${base}/sessions/${s.id}/complete`, { rpe: 11 })).status).toBe(400);
      const done = (await api('participant').post(`${base}/sessions/${s.id}/complete`, { rpe: 8, notes: 'Felt strong' }).expect(200)).body.data;
      expect(done).toMatchObject({ rpe: 8, notes: 'Felt strong', editable: false, volume: 560 });
      expect(done.completedAt).toBeTruthy();

      expect(code(await api('participant').post(`${base}/sessions/${s.id}/complete`, {}))).toBe('SESSION_COMPLETED');
      expect(code(await api('participant').put(`${base}/sessions/${s.id}/sets`, { dayExerciseId: slot, setNo: 2, repsDone: 8 }))).toBe('SESSION_COMPLETED');
      expect(code(await api('participant').del(`${base}/sessions/${s.id}/sets/${slot}/1`))).toBe('SESSION_COMPLETED');

      expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'fitness.workout_completed' } })).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner2.userId, typeKey: 'fitness.workout_completed' } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'fitness.workout_completed' } })).toBe(0);
    });

    it('shows what the client did last time next to the targets', async () => {
      // a session on an earlier date, completed, so today's session of the same day has a "previous"
      const earlier = await t.prisma.fitWorkoutSession.create({
        data: { organizationId: F.orgId, assignmentId: asg, dayId: lower, clientMembershipId: F.participant.membershipId, scheduledDate: new Date(`${addDays(today(), -7)}T00:00:00Z`), startedAt: new Date(), completedAt: new Date() },
      });
      await t.prisma.fitWorkoutSetLog.create({ data: { organizationId: F.orgId, sessionId: earlier.id, dayExerciseId: squatSlot, setNo: 1, repsDone: 8, weightKg: 57.5 } });
      const s = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower }).expect(200)).body.data;
      expect(s.exercises[0].previous).toEqual({ date: addDays(today(), -7), sets: [{ setNo: 1, repsDone: 8, weightKg: 57.5 }] });
      expect(s.exercises[1].previous).toBeNull();
    });

    it('trainers read their clients’ sessions and history; other trainers and clients do not', async () => {
      const s = (await api('participant').post(`${base}/sessions`, { assignmentId: asg, dayId: lower }).expect(200)).body.data;
      expect((await api('practitioner').get(`${base}/sessions/${s.id}`).expect(200)).body.data).toMatchObject({ id: s.id, editable: false, clientName: expect.any(String) });
      expect((await api('manager').get(`${base}/sessions/${s.id}`).expect(200)).body.data.id).toBe(s.id);
      expect((await api('practitioner2').get(`${base}/sessions/${s.id}`)).status).toBe(404);
      expect((await api('participant2').get(`${base}/sessions/${s.id}`)).status).toBe(404);

      const mine = (await api('participant').get(`${base}/sessions`).expect(200)).body.data;
      expect(mine.length).toBeGreaterThanOrEqual(2);
      expect(mine.every((x: { planName: string; setCount: number }) => x.planName && typeof x.setCount === 'number')).toBe(true);
      const viaTrainer = (await api('practitioner').get(`${base}/sessions?clientMembershipId=${F.participant.membershipId}`).expect(200)).body.data;
      expect(viaTrainer.map((x: { id: string }) => x.id)).toContain(s.id);
      expect((await api('practitioner2').get(`${base}/sessions?clientMembershipId=${F.participant.membershipId}`)).status).toBe(404);
      expect((await api('participant').get(`${base}/sessions?clientMembershipId=${F.participant2.membershipId}`)).status).toBe(404);
      expect((await api('participant2').get(`${base}/sessions`).expect(200)).body.data).toEqual([]);
    });

    it('feeds the activity history and the client detail (stats, active plans)', async () => {
      const detail = (await api('practitioner').get(`${base}/clients/${F.participant.membershipId}`).expect(200)).body.data;
      expect(detail.stats.completedLast30Days).toBeGreaterThanOrEqual(1);
      expect(detail.stats.lastSessionAt).toBeTruthy();
      expect(detail.activePlans.map((p: { planName: string }) => p.planName)).toContain('Logging plan');
      const feed = (await api('manager').get(`/api/v1/orgs/${F.orgId}/activity?limit=100`).expect(200)).body.data.map((e: { verb: string }) => e.verb);
      expect(feed).toEqual(expect.arrayContaining(['fitness.plan_assigned', 'fitness.workout_completed']));
    });
  });
});
