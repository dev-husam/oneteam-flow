import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createMetric, createTestApp, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

describe('progress tracking', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  let weight: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Progress Gym');
    base = `/api/v1/orgs/${F.orgId}/progress`;
    weight = (await createMetric(t, F.owner, F.orgId, 'body_mass_kg', false)).id;
  });
  afterAll(async () => t.app.close());

  const record = (who: keyof OrgFixture, subject: keyof OrgFixture, value: number, extra: object = {}) =>
    as(t, F[who] as OrgFixture['owner']).post(`${base}/records`, { subjectMembershipId: (F[subject] as OrgFixture['owner']).membershipId, metricId: weight, value, ...extra });

  describe('metrics', () => {
    it('admins define custom metrics; keys are unique; trainers and clients cannot', async () => {
      const dup = await as(t, F.owner).post(`${base}/metrics`, { key: 'body_mass_kg', name: 'Weight again', unit: 'kg' });
      expect(dup.status).toBe(409);
      expect(code(await as(t, F.practitioner).post(`${base}/metrics`, { key: 'waist_cm', name: 'Waist', unit: 'cm' }))).toBe('FORBIDDEN');
      expect((await as(t, F.owner).post(`${base}/metrics`, { key: 'Bad Key', name: 'x', unit: 'u' })).status).toBe(400);
      expect((await as(t, F.owner).post(`${base}/metrics`, { key: 'waist_cm', name: 'Waist', unit: 'cm', precision: 9 })).status).toBe(400);
      const list = (await as(t, F.participant).get(`${base}/metrics`).expect(200)).body.data;
      expect(list.find((m: { id: string }) => m.id === weight)).toMatchObject({ key: 'body_mass_kg', unit: 'kg', higherIsBetter: false, system: false });
    });
  });

  describe('system measurements from the Fitness module', () => {
    it('are visible to organizations that have the module, flagged as built in, and their keys are reserved', async () => {
      const list = (await as(t, F.participant).get(`${base}/metrics`).expect(200)).body.data;
      expect(list.find((m: { key: string }) => m.key === 'weight_kg')).toMatchObject({ system: true, unit: 'kg', moduleKey: 'fitness', precision: 1 });
      expect(list.filter((m: { system: boolean }) => m.system).length).toBeGreaterThanOrEqual(7);
      const clash = await as(t, F.owner).post(`${base}/metrics`, { key: 'weight_kg', name: 'Mine', unit: 'kg' });
      expect([clash.status, code(clash)]).toEqual([409, 'CONFLICT']);
    });
  });

  describe('recording', () => {
    it('trainers record for their own clients; clients record for themselves; nobody else', async () => {
      expect((await record('practitioner', 'participant', 90, { recordedAt: day(-14) })).status).toBe(201);
      expect((await record('participant', 'participant', 89.2, { recordedAt: day(-7) })).status).toBe(201);
      expect((await record('manager', 'participant2', 70)).status).toBe(201);
      expect((await record('practitioner', 'participant2', 70)).status).toBe(404); // not their client
      expect((await record('participant', 'participant2', 70)).status).toBe(404);
      expect((await record('participant', 'practitioner', 70)).status).toBe(404);
      expect(code(await record('guardian', 'guardian', 70))).toBe('FORBIDDEN');
    });

    it('validates values and dates', async () => {
      expect((await record('practitioner', 'participant', Number.NaN)).status).toBe(400);
      expect((await record('practitioner', 'participant', 1e12)).status).toBe(400);
      expect((await record('practitioner', 'participant', 1.123456)).status).toBe(400);
      expect(code(await record('practitioner', 'participant', 80, { recordedAt: day(3) }))).toBe('VALIDATION_FAILED');
      expect(code(await record('practitioner', 'participant', 80, { recordedAt: '1990-01-01T00:00:00Z' }))).toBe('VALIDATION_FAILED');
      expect((await as(t, F.practitioner).post(`${base}/records`, { subjectMembershipId: F.participant.membershipId, metricId: weight, value: 80, status: 'x' })).status).toBe(400);
    });

    it('series and summary follow the permission scope, oldest first', async () => {
      await record('participant', 'participant', 88.4);
      const series = (await as(t, F.practitioner).get(`${base}/records?subjectMembershipId=${F.participant.membershipId}&metricId=${weight}`).expect(200)).body.data;
      expect(series.map((r: { value: number }) => r.value)).toEqual([90, 89.2, 88.4]);
      expect(series[0].recordedByName).toBe('Test User');

      const s = (await as(t, F.participant).get(`${base}/summary?subjectMembershipId=${F.participant.membershipId}&metricId=${weight}`).expect(200)).body.data;
      expect(s.summary).toMatchObject({ count: 3, change: -1.6, min: 88.4, max: 90, improved: true }); // weight loss is good here
      expect(s.summary.first.value).toBe(90);
      expect(s.metric.key).toBe('body_mass_kg');

      // scope: others cannot read this series, whether by role or by assignment
      for (const who of ['practitioner2', 'participant2'] as const) {
        expect((await as(t, F[who]).get(`${base}/records?subjectMembershipId=${F.participant.membershipId}`)).status, who).toBe(404);
      }
      expect((await as(t, F.manager).get(`${base}/records?subjectMembershipId=${F.participant.membershipId}`).expect(200)).body.data).toHaveLength(3);
    });

    it('records are immutable: a mistake is voided (kept, hidden from charts) and re-entered', async () => {
      const bad = (await record('practitioner', 'participant', 190)).body.data;
      // the client cannot void a measurement the trainer entered
      expect(code(await as(t, F.participant).post(`${base}/records/${bad.id}/void`, { reason: 'looks wrong' }))).toBe('FORBIDDEN');
      expect((await as(t, F.practitioner2).post(`${base}/records/${bad.id}/void`, { reason: 'not mine' })).status).toBe(404);
      await as(t, F.practitioner).post(`${base}/records/${bad.id}/void`, { reason: 'typo: 190 instead of 90' }).expect(204);
      expect((await as(t, F.practitioner).post(`${base}/records/${bad.id}/void`, { reason: 'again' })).status).toBe(404);
      const series = (await as(t, F.practitioner).get(`${base}/records?subjectMembershipId=${F.participant.membershipId}`).expect(200)).body.data;
      expect(series.some((r: { value: number }) => r.value === 190)).toBe(false);
      const row = await t.prisma.metricRecord.findUniqueOrThrow({ where: { id: bad.id } });
      expect(row).toMatchObject({ voidReason: 'typo: 190 instead of 90' });
      expect(row.voidedAt).not.toBeNull();
    });
  });

  describe('goals and milestones', () => {
    it('creates a goal with baseline from the latest record and reports progress', async () => {
      const goal = await as(t, F.practitioner).post(`${base}/goals`, { subjectMembershipId: F.participant.membershipId, metricId: weight, title: 'Reach 80 kg', targetValue: 80, dueDate: '2030-06-01' }).expect(201);
      expect(goal.body.data).toMatchObject({ baselineValue: 88.4, targetValue: 80, direction: 'DECREASE', status: 'ACTIVE', currentValue: 88.4, progress: 0 });
      await record('participant', 'participant', 84.2);
      const goals = (await as(t, F.participant).get(`${base}/goals?subjectMembershipId=${F.participant.membershipId}`).expect(200)).body.data;
      expect(goals[0]).toMatchObject({ currentValue: 84.2, status: 'ACTIVE' });
      expect(goals[0].progress).toBeCloseTo(0.5, 2);
    });

    it('is achieved automatically when a record reaches the target, and both people are told', async () => {
      const subject = F.participant;
      const goals = (await as(t, F.practitioner).get(`${base}/goals?subjectMembershipId=${subject.membershipId}`).expect(200)).body.data;
      await record('participant', 'participant', 79.6);
      const after = (await as(t, F.practitioner).get(`${base}/goals?subjectMembershipId=${subject.membershipId}&status=ACHIEVED`).expect(200)).body.data;
      expect(after.map((g: { id: string }) => g.id)).toContain(goals[0].id);
      expect(after[0]).toMatchObject({ status: 'ACHIEVED', progress: 1 });
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'goal.achieved' } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'goal.achieved' } })).toBe(1);
    });

    it('milestones can be added and achieved; goal changes need goal.manage on that person', async () => {
      const g = (await as(t, F.practitioner).post(`${base}/goals`, { subjectMembershipId: F.participant.membershipId, title: 'Qualitative goal: do a pull-up' }).expect(201)).body.data;
      expect(g).toMatchObject({ metricId: null, progress: null, baselineValue: null });
      const m = (await as(t, F.practitioner).post(`${base}/goals/${g.id}/milestones`, { title: 'Hang for 20 s', dueDate: '2030-01-01' }).expect(201)).body.data;
      await as(t, F.practitioner).post(`${base}/goals/${g.id}/milestones/${m.id}/achieve`).expect(204);
      expect((await as(t, F.practitioner).post(`${base}/goals/${g.id}/milestones/${m.id}/achieve`)).status).toBe(404); // once
      const read = (await as(t, F.participant).get(`${base}/goals?subjectMembershipId=${F.participant.membershipId}`).expect(200)).body.data.find((x: { id: string }) => x.id === g.id);
      expect(read.milestones[0].achievedAt).toBeTruthy();

      expect(code(await as(t, F.participant).patch(`${base}/goals/${g.id}`, { title: 'Hijacked' }))).toBe('FORBIDDEN'); // clients have no goal.manage
      expect((await as(t, F.practitioner2).patch(`${base}/goals/${g.id}`, { title: 'Hijacked' })).status).toBe(404);
      expect((await as(t, F.practitioner).patch(`${base}/goals/${g.id}`, { status: 'ABANDONED' }).expect(200)).body.data.status).toBe('ABANDONED');
      expect((await as(t, F.practitioner2).get(`${base}/goals?subjectMembershipId=${F.participant.membershipId}`)).status).toBe(404);
    });
  });

  describe('group progress', () => {
    it('summarizes only the members the caller may see', async () => {
      const group = (await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'Progress class' }).expect(201)).body.data.id;
      for (const m of [F.participant, F.participant2]) await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups/${group}/members`, { membershipId: m.membershipId }).expect(200);
      const path = `${base}/groups/${group}/summary?metricId=${weight}`;

      const all = (await as(t, F.manager).get(path).expect(200)).body.data;
      expect(all.aggregate).toMatchObject({ visibleMembers: 2, withData: 2, min: 70, max: 79.6 });
      expect(all.aggregate.average).toBeCloseTo(74.8, 1);

      // the trainer created no group (404 for them) so use a group they own
      const own = (await as(t, F.practitioner).post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'My class' }).expect(201)).body.data.id;
      await as(t, F.practitioner).post(`/api/v1/orgs/${F.orgId}/groups/${own}/members`, { membershipId: F.participant.membershipId }).expect(200);
      await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups/${own}/members`, { membershipId: F.participant2.membershipId }).expect(200);
      const mine = (await as(t, F.practitioner).get(`${base}/groups/${own}/summary?metricId=${weight}`).expect(200)).body.data;
      expect(mine.aggregate.visibleMembers).toBe(1); // participant2 is not their client
      expect(mine.members.map((m: { membershipId: string }) => m.membershipId)).toEqual([F.participant.membershipId]);
      expect((await as(t, F.practitioner).get(path)).status).toBe(404); // someone else's group
    });
  });
});
