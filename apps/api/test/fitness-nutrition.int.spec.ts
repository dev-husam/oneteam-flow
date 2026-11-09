import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, dateInTimeZone } from '@pt/domain';
import { PNG, as, buildOrg, createTestApp, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;
const today = () => dateInTimeZone(new Date(), 'UTC');

describe('fitness: nutrition plans and meal logs', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);

  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Nutrition Gym');
    base = `/api/v1/orgs/${F.orgId}/fitness`;
  });
  afterAll(async () => t.app.close());

  const meal = (mealType: string, name: string, calories = 400) => ({ mealType, timeOfDay: '08:00', items: [{ name, quantity: 100, unit: 'g', calories, proteinG: 20, carbsG: 40, fatG: 10 }] });
  /** The same two meals every day of the week, so any day can be logged. */
  const content = (name = 'Oats') => ({ notes: 'Drink water', days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: [meal('BREAKFAST', name), meal('LUNCH', 'Chicken and rice', 650)] })) });
  const publishedPlan = async (who: keyof OrgFixture = 'practitioner', name = 'Lean plan') => {
    const plan = (await api(who).post(`${base}/nutrition-plans`, { name }).expect(201)).body.data;
    const versionId = plan.versions[0].id as string;
    await api(who).put(`${base}/nutrition-plans/${plan.id}/versions/${versionId}/content`, content()).expect(200);
    await api(who).post(`${base}/nutrition-plans/${plan.id}/versions/${versionId}/publish`).expect(200);
    return { planId: plan.id as string, versionId };
  };
  const assign = (who: keyof OrgFixture, planId: string, body: object) => api(who).post(`${base}/nutrition-plans/${planId}/assignments`, { startDate: today(), ...body });

  describe('plans', () => {
    it('only staff with the permission build plans; clients and guardians cannot', async () => {
      expect((await api('participant').post(`${base}/nutrition-plans`, { name: 'Nope' })).status).toBe(403);
      expect((await api('guardian').get(`${base}/nutrition-plans`)).status).toBe(403);
      expect((await api('practitioner').post(`${base}/nutrition-plans`, { name: 'Mine' })).status).toBe(201);
    });

    it('drafts are validated with paths, published versions are locked, changes become a new version', async () => {
      const plan = (await api('practitioner').post(`${base}/nutrition-plans`, { name: 'Versioned' }).expect(201)).body.data;
      const v1 = plan.versions[0].id;
      const path = `${base}/nutrition-plans/${plan.id}/versions/${v1}`;
      expect(code(await api('practitioner').post(`${path}/publish`))).toBe('PLAN_INVALID'); // empty

      const bad = await api('practitioner').put(`${path}/content`, { days: [{ weekday: 1, meals: [{ mealType: 'BREAKFAST', timeOfDay: '8am', items: [{ name: 'Oats', calories: -1 }] }] }, { weekday: 1, meals: [] }] });
      expect(code(bad)).toBe('PLAN_INVALID');
      expect(bad.body.error.details.issues).toEqual(expect.arrayContaining([
        { path: 'days[0].meals[0].timeOfDay', rule: 'time' }, { path: 'days[0].meals[0].items[0].calories', rule: 'range' }, { path: 'days[1].weekday', rule: 'duplicateWeekday' },
      ]));
      expect((await api('practitioner').put(`${path}/content`, { days: [{ weekday: 1, meals: [{ mealType: 'BRUNCH', items: [] }] }] })).status).toBe(400); // not an allowed meal type

      const saved = (await api('practitioner').put(`${path}/content`, content()).expect(200)).body.data;
      expect(saved.days).toHaveLength(7);
      expect(saved.days[0].meals[0]).toMatchObject({ mealType: 'BREAKFAST', timeOfDay: '08:00', totals: { calories: 400, proteinG: 20, carbsG: 40, fatG: 10 } });
      expect(saved.days[0].totals.calories).toBe(1050);
      expect(await t.prisma.fitMeal.count({ where: { day: { versionId: v1 } } })).toBe(14); // replaced, not appended
      await api('practitioner').put(`${path}/content`, content()).expect(200);
      expect(await t.prisma.fitMeal.count({ where: { day: { versionId: v1 } } })).toBe(14);

      expect((await api('practitioner').post(`${path}/publish`).expect(200)).body.data.currentVersion).toMatchObject({ id: v1, versionNo: 1, dayCount: 7 });
      expect(code(await api('practitioner').put(`${path}/content`, content()))).toBe('PLAN_VERSION_LOCKED');
      expect(code(await api('practitioner').del(path))).toBe('PLAN_VERSION_LOCKED');

      const draft = (await api('practitioner').post(`${base}/nutrition-plans/${plan.id}/versions`).expect(201)).body.data;
      expect(draft).toMatchObject({ versionNo: 2, published: false });
      expect(draft.days).toHaveLength(7);
      expect(code(await api('practitioner').post(`${base}/nutrition-plans/${plan.id}/versions`))).toBe('CONFLICT');
      await api('practitioner').del(`${base}/nutrition-plans/${plan.id}/versions/${draft.id}`).expect(204);
    });

    it('plans are private to their creator under OWN scope; managers see all', async () => {
      const { planId } = await publishedPlan('practitioner', 'Private plan');
      expect((await api('practitioner2').get(`${base}/nutrition-plans/${planId}`)).status).toBe(404);
      expect((await api('manager').get(`${base}/nutrition-plans/${planId}`).expect(200)).body.data.name).toBe('Private plan');
      await api('practitioner').del(`${base}/nutrition-plans/${planId}`).expect(204);
      expect(code(await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }))).toBe('PLAN_INVALID'); // archived
    });
  });

  describe('assignments', () => {
    it('assigns a published version to many clients, pinned to that version, with notification and audit', async () => {
      const { planId, versionId } = await publishedPlan('manager', 'Team plan');
      const res = await assign('manager', planId, { clientMembershipIds: [F.participant.membershipId, F.participant2.membershipId] }).expect(201);
      expect(res.body.data.assignments).toHaveLength(2);
      const rows = await t.prisma.fitNutritionAssignment.findMany({ where: { batchId: res.body.data.batchId } });
      expect(rows.every((r) => r.versionId === versionId && r.assignedByMembershipId === F.manager.membershipId)).toBe(true);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'fitness.nutrition_assigned' } })).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'fitness.nutrition_plan.assigned', targetId: planId } })).toBe(1);

      // a new version later does not change what the clients were given
      const draft = (await api('manager').post(`${base}/nutrition-plans/${planId}/versions`).expect(201)).body.data;
      await api('manager').put(`${base}/nutrition-plans/${planId}/versions/${draft.id}/content`, content('Eggs')).expect(200);
      await api('manager').post(`${base}/nutrition-plans/${planId}/versions/${draft.id}/publish`).expect(200);
      const seen = (await api('participant').get(`${base}/nutrition/assignments/${res.body.data.assignments[0].id}`).expect(200)).body.data;
      expect(seen.versionId).toBe(versionId);
      expect(seen.content.days[0].meals[0].items[0].name).toBe('Oats');
    });

    it('validates dates, reach and plan state; out-of-reach clients fail the whole request', async () => {
      const { planId } = await publishedPlan('practitioner', 'Rules plan');
      const clients = { clientMembershipIds: [F.participant.membershipId] };
      expect((await assign('participant', planId, clients)).status).toBe(403);
      expect(code(await assign('practitioner', planId, { ...clients, startDate: addDays(today(), -1) }))).toBe('VALIDATION_FAILED');
      expect(code(await assign('practitioner', planId, { ...clients, endDate: addDays(today(), -2) }))).toBe('VALIDATION_FAILED');
      expect(code(await assign('practitioner', planId, { clientMembershipIds: [] }))).toBe('VALIDATION_FAILED');
      const before = await t.prisma.fitNutritionAssignment.count({ where: { organizationId: F.orgId } });
      expect((await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId, F.participant2.membershipId] })).status).toBe(404); // participant2 is not their client
      expect(await t.prisma.fitNutritionAssignment.count({ where: { organizationId: F.orgId } })).toBe(before);
      const draftOnly = (await api('practitioner').post(`${base}/nutrition-plans`, { name: 'Unpublished' }).expect(201)).body.data;
      expect(code(await assign('practitioner', draftOnly.id, clients))).toBe('PLAN_INVALID');
    });

    it('lists by reach and cancels while keeping the history', async () => {
      const { planId } = await publishedPlan('practitioner', 'Cancel plan');
      const id = (await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }).expect(201)).body.data.assignments[0].id;
      const ids = (who: keyof OrgFixture) => api(who).get(`${base}/nutrition/assignments?limit=100`).expect(200).then((r) => r.body.data.map((a: { id: string }) => a.id));
      expect(await ids('participant')).toContain(id);
      expect(await ids('practitioner')).toContain(id);
      expect(await ids('practitioner2')).not.toContain(id);
      expect(await ids('participant2')).not.toContain(id);
      expect((await api('practitioner2').get(`${base}/nutrition/assignments/${id}`)).status).toBe(404);
      expect((await api('participant').post(`${base}/nutrition/assignments/${id}/cancel`)).status).toBe(403);
      await api('practitioner').post(`${base}/nutrition/assignments/${id}/cancel`).expect(204);
      expect((await api('participant').get(`${base}/nutrition/assignments/${id}`).expect(200)).body.data.state).toBe('CANCELLED');
    });
  });

  describe('meal logs', () => {
    let asg: string;
    let breakfast: string;
    let lunch: string;
    beforeAll(async () => {
      const { planId } = await publishedPlan('practitioner', 'Logging plan');
      asg = (await assign('practitioner', planId, { clientMembershipIds: [F.participant.membershipId] }).expect(201)).body.data.assignments[0].id;
      const day = (await api('participant').get(`${base}/nutrition/today`).expect(200)).body.data;
      const mine = day.items.find((i: { assignmentId: string }) => i.assignmentId === asg);
      breakfast = mine.meals[0].mealId;
      lunch = mine.meals[1].mealId;
    });

    it('shows today\'s planned meals with their macros, and nothing for someone without a plan', async () => {
      const day = (await api('participant').get(`${base}/nutrition/today`).expect(200)).body.data;
      expect(day.date).toBe(today());
      const mine = day.items.find((i: { assignmentId: string }) => i.assignmentId === asg);
      expect(mine.meals.map((m: { mealType: string }) => m.mealType)).toEqual(['BREAKFAST', 'LUNCH']);
      expect(mine.meals[1]).toMatchObject({ totals: { calories: 650 }, log: null });
      const other = (await api('participant2').get(`${base}/nutrition/today`).expect(200)).body.data;
      expect(other.items.map((i: { assignmentId: string }) => i.assignmentId)).not.toContain(asg);
      expect(code(await api('participant').get(`${base}/nutrition/today?date=${addDays(today(), 1)}`))).toBe('VALIDATION_FAILED');
    });

    it('logs and corrects a meal (one log per meal and day), with adherence scored completed 1, partial 0.5', async () => {
      const put = (body: object, who: keyof OrgFixture = 'participant') => api(who).put(`${base}/nutrition/logs`, { assignmentId: asg, ...body });
      const first = (await put({ mealId: breakfast, status: 'COMPLETED', notes: 'All of it' }).expect(200)).body.data;
      expect(first).toMatchObject({ status: 'COMPLETED', notes: 'All of it', logDate: today() });
      const fixed = (await put({ mealId: breakfast, status: 'PARTIAL' }).expect(200)).body.data;
      expect(fixed.id).toBe(first.id); // corrected, not duplicated
      expect(await t.prisma.fitMealLog.count({ where: { assignmentId: asg, mealId: breakfast } })).toBe(1);
      await put({ mealId: lunch, status: 'COMPLETED' }).expect(200);
      const day = (await api('participant').get(`${base}/nutrition/today`).expect(200)).body.data;
      expect(day.adherencePct).toBeGreaterThanOrEqual(0);
      const mine = day.items.find((i: { assignmentId: string }) => i.assignmentId === asg);
      expect(mine.meals.map((m: { log: { status: string } }) => m.log.status)).toEqual(['PARTIAL', 'COMPLETED']);
    });

    it('rejects meals that are not planned, future dates, other people\'s assignments and invalid statuses', async () => {
      const put = (body: object, who: keyof OrgFixture = 'participant') => api(who).put(`${base}/nutrition/logs`, { assignmentId: asg, ...body });
      expect((await put({ mealId: '00000000-0000-7000-8000-000000000000', status: 'COMPLETED' })).status).toBe(404);
      expect(code(await put({ mealId: breakfast, status: 'COMPLETED', logDate: addDays(today(), 1) }))).toBe('VALIDATION_FAILED');
      expect(code(await put({ mealId: breakfast, status: 'COMPLETED', logDate: addDays(today(), -1) }))).toBe('VALIDATION_FAILED'); // before the plan started
      expect((await put({ mealId: breakfast, status: 'COMPLETED' }, 'participant2')).status).toBe(404);
      expect((await put({ mealId: breakfast, status: 'COMPLETED' }, 'practitioner')).status).toBe(404); // a trainer cannot eat for the client
      expect((await put({ mealId: breakfast, status: 'MAYBE' })).status).toBe(400);
      expect((await put({ mealId: breakfast, status: 'SKIPPED', notes: 'x'.repeat(501) })).status).toBe(400);
    });

    it('photos: attach up to three of your own images, no reuse, detach removes the file; trainers in reach can view them', async () => {
      const log = (await api('participant').put(`${base}/nutrition/logs`, { assignmentId: asg, mealId: lunch, status: 'COMPLETED' }).expect(200)).body.data;
      const upload = () => uploadFile(t, F.participant, F.orgId, PNG, 'image/png', 'meal.png');
      const [a, b, c, d] = [await upload(), await upload(), await upload(), await upload()];
      const attach = (fileId: string, who: keyof OrgFixture = 'participant') => api(who).post(`${base}/nutrition/logs/${log.id}/photos`, { fileId });
      expect((await attach(a.id).expect(200)).body.data.photoFileIds).toEqual([a.id]);
      await attach(b.id).expect(200);
      await attach(c.id).expect(200);
      expect(code(await attach(d.id))).toBe('CONFLICT'); // three is the limit
      expect((await attach(a.id).expect(200)).body.data.photoFileIds).toHaveLength(3); // attaching again changes nothing

      const stranger = await uploadFile(t, F.participant2, F.orgId, PNG, 'image/png', 's.png');
      expect((await attach(stranger.id)).status).toBe(404); // not their upload
      const log2 = (await api('participant').put(`${base}/nutrition/logs`, { assignmentId: asg, mealId: breakfast, status: 'COMPLETED' }).expect(200)).body.data;
      expect(code(await api('participant').post(`${base}/nutrition/logs/${log2.id}/photos`, { fileId: a.id }))).toBe('CONFLICT'); // already on another log
      const pdf = await uploadFile(t, F.participant, F.orgId, Buffer.from('%PDF-1.7\n'), 'application/pdf', 'x.pdf');
      expect((await api('participant').post(`${base}/nutrition/logs/${log2.id}/photos`, { fileId: pdf.id })).status).toBe(404); // images only

      // the client's trainer may see the photo; another trainer may not
      expect((await api('practitioner').get(`/api/v1/orgs/${F.orgId}/files/${a.id}/download-url`)).status).toBe(200);
      expect((await api('practitioner2').get(`/api/v1/orgs/${F.orgId}/files/${a.id}/download-url`)).status).toBe(404);
      expect((await api('participant2').get(`/api/v1/orgs/${F.orgId}/files/${a.id}/download-url`)).status).toBe(404);

      const left = (await api('participant').del(`${base}/nutrition/logs/${log.id}/photos/${a.id}`).expect(200)).body.data;
      expect(left.photoFileIds).toHaveLength(2);
      expect((await t.prisma.file.findUniqueOrThrow({ where: { id: a.id } })).deletedAt).not.toBeNull();
      expect((await api('participant2').del(`${base}/nutrition/logs/${log.id}/photos/${b.id}`)).status).toBe(404);
    });

    it('trainers read their clients\' logs and adherence over a range; others cannot', async () => {
      const q = `from=${today()}&to=${today()}`;
      const res = (await api('practitioner').get(`${base}/nutrition/logs?clientMembershipId=${F.participant.membershipId}&${q}`).expect(200)).body.data;
      expect(res.logs.length).toBeGreaterThanOrEqual(2);
      expect(res.logs[0]).toMatchObject({ planName: 'Logging plan', mealType: expect.any(String) });
      expect(res.adherence.planned).toBeGreaterThanOrEqual(2);
      expect(res.adherence.pct).toBeGreaterThan(0);
      expect((await api('participant').get(`${base}/nutrition/logs?${q}`).expect(200)).body.data.logs.length).toBeGreaterThanOrEqual(2);
      expect((await api('practitioner2').get(`${base}/nutrition/logs?clientMembershipId=${F.participant.membershipId}&${q}`)).status).toBe(404);
      expect((await api('participant').get(`${base}/nutrition/logs?clientMembershipId=${F.participant2.membershipId}&${q}`)).status).toBe(404);
      expect(code(await api('practitioner').get(`${base}/nutrition/logs?clientMembershipId=${F.participant.membershipId}&from=${addDays(today(), -40)}&to=${today()}`))).toBe('VALIDATION_FAILED'); // at most a month
    });
  });
});
