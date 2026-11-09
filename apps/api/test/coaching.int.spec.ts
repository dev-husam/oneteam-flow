import { WHEEL_OF_LIFE_QUESTIONS } from '@pt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionRemindersService } from '../src/modules/coaching/reminders/session-reminders.service.js';
import { as, buildOrg, createTestApp, PNG, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Phase 8a: the Coaching module. The category is switched on for the test and restored afterwards (the database is shared). */
describe('coaching module', () => {
  let t: TestApp;
  let F: OrgFixture;
  let fitness: OrgFixture;
  let base: string;
  const api = (who: keyof OrgFixture) => as(t, F[who] as OrgFixture['owner']);
  const unread = async (who: keyof OrgFixture) => (await api(who).get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count as number;
  const client = () => F.participant.membershipId;

  beforeAll(async () => {
    t = await createTestApp();
    await t.prisma.businessCategory.update({ where: { key: 'coaching' }, data: { status: 'ENABLED' } });
    F = await buildOrg(t, 'Coach Studio', { categoryKey: 'coaching' });
    fitness = await buildOrg(t, 'Fitness Control');
    base = `/api/v1/orgs/${F.orgId}/coaching`;
  });
  afterAll(async () => {
    await t.prisma.businessCategory.update({ where: { key: 'coaching' }, data: { status: 'DISABLED' } });
    await t.app.close();
  });

  it('only organizations with the module have it; roles and vocabulary come from the category', async () => {
    expect(code(await as(t, fitness.owner).get(`/api/v1/orgs/${fitness.orgId}/coaching/sessions`))).toBe('MODULE_NOT_ENABLED');
    const ctx = (await api('practitioner').get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data;
    expect(ctx.enabledModules).toContain('coaching');
    expect(ctx.navigation.map((n: { key: string }) => n.key)).toEqual(expect.arrayContaining(['coaching', 'assessments', 'resources']));
    expect(ctx.membership.role.labelKey).toBe('role.practitioner.coach');
    expect(ctx.navigation.map((n: { key: string }) => n.key)).not.toContain('my-coaching'); // the client’s page is not offered to coaches
    const clientNav = (await api('participant').get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.navigation.map((n: { key: string }) => n.key);
    expect(clientNav).toContain('my-coaching');
    expect(clientNav).not.toContain('coaching');
  });

  describe('sessions', () => {
    let sessionId: string;

    it('a coach schedules a session for an assigned client; the client sees it and is told', async () => {
      const before = await unread('participant');
      const res = await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(48), durationMinutes: 60, location: 'https://meet.example.test/abc', agenda: 'Goals for the quarter' });
      expect(res.status).toBe(201);
      sessionId = res.body.data.id;
      expect(res.body.data).toMatchObject({ status: 'PLANNED', durationMinutes: 60, coachMembershipId: F.practitioner.membershipId, clientMembershipId: client() });
      expect(await unread('participant')).toBe(before + 1);
      const mine = (await api('participant').get(`${base}/sessions`).expect(200)).body.data;
      expect(mine.map((s: { id: string }) => s.id)).toContain(sessionId);
    });

    it('is closed to everyone else: other coaches, other clients, and clients managing sessions', async () => {
      expect(code(await api('practitioner2').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(30), durationMinutes: 30 }))).toBe('NOT_FOUND'); // not their client
      expect(code(await api('participant').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(30), durationMinutes: 30 }))).toBe('FORBIDDEN');
      expect((await api('participant2').get(`${base}/sessions/${sessionId}`)).status).toBe(404);
      expect((await api('practitioner2').get(`${base}/sessions/${sessionId}`)).status).toBe(404);
      expect((await api('participant2').get(`${base}/sessions`).expect(200)).body.data).toEqual([]);
      expect(code(await api('participant').patch(`${base}/sessions/${sessionId}`, { durationMinutes: 15 }))).toBe('FORBIDDEN');
      expect(code(await api('practitioner2').post(`${base}/sessions/${sessionId}/cancel`, {}))).toBe('NOT_FOUND');
      // an owner has organization-wide reach
      expect((await api('owner').get(`${base}/sessions/${sessionId}`)).status).toBe(200);
    });

    it('validates time and length', async () => {
      expect(code(await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(-3), durationMinutes: 30 }))).toBe('SESSION_IN_PAST');
      expect((await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(5), durationMinutes: 5 })).status).toBe(400);
      expect((await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: 'tomorrow', durationMinutes: 30 })).status).toBe(400);
      expect((await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(24 * 800), durationMinutes: 30 })).status).toBe(400);
    });

    it('moving a session tells the client and restarts its reminders; it cannot be marked held before it starts', async () => {
      await t.prisma.coachSession.update({ where: { id: sessionId }, data: { reminderDaySentAt: new Date() } });
      const before = await unread('participant');
      const res = await api('practitioner').patch(`${base}/sessions/${sessionId}`, { startsAt: inHours(72), location: '' });
      expect(res.status).toBe(200);
      expect(res.body.data.location).toBeNull();
      expect(await unread('participant')).toBe(before + 1);
      expect((await t.prisma.coachSession.findUniqueOrThrow({ where: { id: sessionId } })).reminderDaySentAt).toBeNull();
      expect(code(await api('practitioner').post(`${base}/sessions/${sessionId}/complete`, {}))).toBe('SESSION_NOT_STARTED');
    });

    it('is held once started, then fixed; a cancelled session cannot be changed', async () => {
      await t.prisma.coachSession.update({ where: { id: sessionId }, data: { startsAt: new Date(Date.now() - 3_600_000) } });
      expect((await api('practitioner').post(`${base}/sessions/${sessionId}/complete`, {})).body.data.status).toBe('HELD');
      expect(code(await api('practitioner').patch(`${base}/sessions/${sessionId}`, { durationMinutes: 45 }))).toBe('SESSION_NOT_PLANNED');
      const second = (await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(100), durationMinutes: 30 }).expect(201)).body.data.id;
      const before = await unread('participant');
      const cancelled = await api('practitioner').post(`${base}/sessions/${second}/cancel`, { reason: 'Travelling' }).expect(200);
      expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Travelling' });
      expect(await unread('participant')).toBe(before + 1);
      expect(code(await api('practitioner').post(`${base}/sessions/${second}/cancel`, {}))).toBe('SESSION_NOT_PLANNED');
    });

    it('reminders: the day before and shortly before, each once, to both people, and not for organizations that switched reminders off', async () => {
      const id = (await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(20), durationMinutes: 30 }).expect(201)).body.data.id as string;
      const count = (userId: string, type: string) => t.prisma.notification.count({ where: { userId, typeKey: type } });
      const reminders = t.app.get(SessionRemindersService);
      const sessionUsers = [F.participant.userId, F.practitioner.userId];

      expect(await reminders.run(new Date())).toMatchObject({ day: 1, soon: 0 });
      await reminders.run(new Date());
      for (const u of sessionUsers) expect(await count(u, 'coaching.session_reminder_day')).toBe(1);

      await t.prisma.coachSession.update({ where: { id }, data: { startsAt: new Date(Date.now() + 3_600_000) } });
      expect(await reminders.run(new Date())).toMatchObject({ soon: 1 });
      await reminders.run(new Date());
      for (const u of sessionUsers) expect(await count(u, 'coaching.session_reminder_soon')).toBe(1);

      // switched off for this organization: nothing is sent
      const off = (await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(22), durationMinutes: 30 }).expect(201)).body.data.id as string;
      await t.prisma.featureFlag.update({ where: { key: 'reminders' }, data: { enabled: false } });
      try {
        expect(await reminders.run(new Date())).toEqual({ day: 0, soon: 0 });
      } finally {
        await t.prisma.featureFlag.update({ where: { key: 'reminders' }, data: { enabled: true } });
      }
      expect((await t.prisma.coachSession.findUniqueOrThrow({ where: { id: off } })).reminderDaySentAt).toBeNull();
    });
  });

  describe('notes', () => {
    it('shared notes reach the client; private notes never do and are stored encrypted', async () => {
      const before = await unread('participant');
      const shared = await api('practitioner').post(`${base}/notes`, { clientMembershipId: client(), visibility: 'SHARED', body: 'Agreed: two focus areas.' }).expect(201);
      expect(await unread('participant')).toBe(before + 1);
      const secret = 'Seems anxious about the new manager; revisit.';
      const priv = await api('practitioner').post(`${base}/notes`, { clientMembershipId: client(), visibility: 'PRIVATE', body: secret }).expect(201);
      expect(await unread('participant')).toBe(before + 1); // a private note notifies nobody
      expect(priv.body.data).toMatchObject({ visibility: 'PRIVATE', body: secret, mine: true });

      const stored = await t.prisma.coachNote.findUniqueOrThrow({ where: { id: priv.body.data.id } });
      expect(stored.body).not.toContain('anxious');
      expect(stored.body.split('.')).toHaveLength(3); // iv.tag.ciphertext

      const seenByClient = (await api('participant').get(`${base}/notes?clientMembershipId=${client()}`).expect(200)).body.data;
      expect(seenByClient.map((n: { id: string }) => n.id)).toEqual([shared.body.data.id]);
      expect(JSON.stringify(seenByClient)).not.toContain('anxious');
      const seenByCoach = (await api('practitioner').get(`${base}/notes?clientMembershipId=${client()}`).expect(200)).body.data;
      expect(seenByCoach.map((n: { visibility: string }) => n.visibility).sort()).toEqual(['PRIVATE', 'SHARED']);
    });

    it('only the people who should see them can: other coaches, other clients and admins see nothing private', async () => {
      expect(code(await api('practitioner2').get(`${base}/notes?clientMembershipId=${client()}`))).toBe('NOT_FOUND');
      expect(code(await api('participant2').get(`${base}/notes?clientMembershipId=${client()}`))).toBe('NOT_FOUND');
      const admin = (await api('admin').get(`${base}/notes?clientMembershipId=${client()}`).expect(200)).body.data;
      expect(admin.every((n: { visibility: string }) => n.visibility === 'SHARED')).toBe(true); // an administrator reads shared notes, never private ones
      expect(code(await api('participant').post(`${base}/notes`, { clientMembershipId: client(), visibility: 'SHARED', body: 'hi' }))).toBe('FORBIDDEN');
      expect(code(await api('practitioner2').post(`${base}/notes`, { clientMembershipId: client(), visibility: 'SHARED', body: 'hi' }))).toBe('NOT_FOUND');
    });

    it('an owner can read the coach’s private notes, and that read is audited without the text', async () => {
      const before = await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'coaching.private_notes_read' } });
      const seen = (await api('owner').get(`${base}/notes?clientMembershipId=${client()}`).expect(200)).body.data;
      expect(seen.some((n: { visibility: string; mine: boolean }) => n.visibility === 'PRIVATE' && !n.mine)).toBe(true);
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'coaching.private_notes_read' } })).toBe(before + 1);
      const logs = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: 'coaching.private_notes_read' }, orderBy: { createdAt: 'desc' }, take: 1 });
      expect(JSON.stringify(logs[0]!.metadata)).not.toContain('anxious');
      // the coach reading their own notes is not an access to audit
      const mine = await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'coaching.private_notes_read', actorUserId: F.practitioner.userId } });
      expect(mine).toBe(0);
    });

    it('authors edit and delete their own notes; nobody else can, owners included; making a note shared tells the client', async () => {
      const priv = (await api('practitioner').post(`${base}/notes`, { clientMembershipId: client(), visibility: 'PRIVATE', body: 'Draft thought' }).expect(201)).body.data.id as string;
      expect(code(await api('owner').patch(`${base}/notes/${priv}`, { body: 'overwritten' }))).toBe('NOT_FOUND');
      expect(code(await api('owner').del(`${base}/notes/${priv}`))).toBe('NOT_FOUND');
      const before = await unread('participant');
      const shared = await api('practitioner').patch(`${base}/notes/${priv}`, { visibility: 'SHARED', body: 'Worth sharing' }).expect(200);
      expect(shared.body.data).toMatchObject({ visibility: 'SHARED', body: 'Worth sharing' });
      expect(await unread('participant')).toBe(before + 1);
      expect((await t.prisma.coachNote.findUniqueOrThrow({ where: { id: priv } })).body).toBe('Worth sharing');
      await api('practitioner').del(`${base}/notes/${priv}`).expect(204);
      expect(await t.prisma.coachNote.count({ where: { id: priv } })).toBe(0);
    });

    it('a note can be tied to a session of that client only', async () => {
      const s = (await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(10), durationMinutes: 30 }).expect(201)).body.data.id;
      await api('practitioner').post(`${base}/notes`, { clientMembershipId: client(), sessionId: s, visibility: 'SHARED', body: 'Prep for the session' }).expect(201);
      expect((await api('participant').get(`${base}/notes?clientMembershipId=${client()}&sessionId=${s}`).expect(200)).body.data).toHaveLength(1);
      // F.participant2 is not assigned to practitioner: the coach cannot write to them at all
      expect(code(await api('practitioner').post(`${base}/notes`, { clientMembershipId: F.participant2.membershipId, sessionId: s, visibility: 'SHARED', body: 'x' }))).toBe('NOT_FOUND');
    });

    it('is written to the audit log without the text', async () => {
      const logs = await t.prisma.auditLog.findMany({ where: { organizationId: F.orgId, action: { startsWith: 'coaching.note_' } } });
      expect(logs.length).toBeGreaterThan(3);
      expect(JSON.stringify(logs.map((l) => l.metadata))).not.toMatch(/anxious|Draft thought|Worth sharing/);
    });
  });

  describe('assessments', () => {
    let templateId: string;
    let first: string;

    it('a coach creates a template from the wheel of life; bad questions are refused with the exact problems', async () => {
      const bad = await api('practitioner').post(`${base}/assessment-templates`, { name: 'Bad', questions: [{ id: 'A b', kind: 'RANK', label: { en: '', ar: '' } }] });
      expect(code(bad)).toBe('ASSESSMENT_INVALID');
      expect(bad.body.error.details.issues.map((i: { rule: string }) => i.rule)).toEqual(expect.arrayContaining(['id', 'kind', 'label']));
      const made = await api('practitioner').post(`${base}/assessment-templates`, { name: 'Wheel of life', description: 'Eight areas', questions: WHEEL_OF_LIFE_QUESTIONS }).expect(201);
      templateId = made.body.data.id;
      expect(made.body.data.questions).toHaveLength(8);
      expect((await api('practitioner2').get(`${base}/assessment-templates`).expect(200)).body.data.map((x: { id: string }) => x.id)).toContain(templateId); // shared by the organization’s coaches
      expect(code(await api('participant').get(`${base}/assessment-templates`))).toBe('FORBIDDEN');
    });

    it('requests one from an assigned client, once at a time, and tells them', async () => {
      const before = await unread('participant');
      const res = await api('practitioner').post(`${base}/assessments`, { templateId, clientMembershipId: client(), cadenceDays: 14 });
      expect(res.status).toBe(201);
      first = res.body.data.id;
      expect(res.body.data).toMatchObject({ status: 'REQUESTED', cadenceDays: 14, title: 'Wheel of life' });
      expect(await unread('participant')).toBe(before + 1);
      expect(code(await api('practitioner').post(`${base}/assessments`, { templateId, clientMembershipId: client() }))).toBe('CONFLICT');
      expect(code(await api('practitioner2').post(`${base}/assessments`, { templateId, clientMembershipId: client() }))).toBe('NOT_FOUND');
      expect(code(await api('participant').post(`${base}/assessments`, { templateId, clientMembershipId: client() }))).toBe('FORBIDDEN');
    });

    it('only the client and their coach see it', async () => {
      const open = (await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data;
      expect(open.map((a: { id: string }) => a.id)).toEqual([first]);
      expect((await api('participant2').get(`${base}/assessments/${first}`)).status).toBe(404);
      expect((await api('practitioner2').get(`${base}/assessments/${first}`)).status).toBe(404);
      expect((await api('practitioner').get(`${base}/assessments/${first}`)).status).toBe(200);
      expect((await api('participant2').get(`${base}/assessments`).expect(200)).body.data).toEqual([]);
    });

    it('the client answers: invalid answers are listed, then a valid one completes it, tells the coach and schedules the repeat', async () => {
      const answers = Object.fromEntries(WHEEL_OF_LIFE_QUESTIONS.map((q, i) => [q.id, 4 + (i % 3)]));
      const bad = await api('participant').post(`${base}/assessments/${first}/submit`, { answers: { ...answers, health: 11, bogus: 1 } });
      expect(code(bad)).toBe('ASSESSMENT_INVALID');
      expect(bad.body.error.details.issues).toEqual(expect.arrayContaining([{ path: 'answers.health', rule: 'range' }, { path: 'answers.bogus', rule: 'unknown' }]));
      expect(code(await api('participant2').post(`${base}/assessments/${first}/submit`, { answers }))).toBe('NOT_FOUND');
      expect(code(await api('practitioner').post(`${base}/assessments/${first}/submit`, { answers }))).toBe('NOT_FOUND'); // coaches cannot answer for clients: only your own assessments exist for you

      const coachBefore = await unread('practitioner');
      const done = await api('participant').post(`${base}/assessments/${first}/submit`, { answers }).expect(200);
      expect(done.body.data).toMatchObject({ status: 'COMPLETED', answers: { health: 4 } });
      expect(await unread('practitioner')).toBe(coachBefore + 1);
      expect(code(await api('participant').post(`${base}/assessments/${first}/submit`, { answers }))).toBe('ASSESSMENT_NOT_OPEN');

      const next = (await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data;
      expect(next).toHaveLength(1);
      expect(next[0].id).not.toBe(first);
      expect(next[0]).toMatchObject({ cadenceDays: 14, title: 'Wheel of life' });
      const days = (new Date(next[0].dueAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThan(14.1);
    });

    it('editing the template later does not change a request already sent', async () => {
      const open = (await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data[0];
      await api('practitioner').patch(`${base}/assessment-templates/${templateId}`, { questions: [{ id: 'only', kind: 'SCALE', label: { en: 'Only one', ar: '' } }] }).expect(200);
      const again = (await api('participant').get(`${base}/assessments/${open.id}`).expect(200)).body.data;
      expect(again.questions).toHaveLength(8);
      expect(code(await api('practitioner2').patch(`${base}/assessment-templates/${templateId}`, { name: 'Mine now' }))).toBe('NOT_FOUND'); // coaches edit their own templates
      await api('owner').patch(`${base}/assessment-templates/${templateId}`, { name: 'Wheel of life' }).expect(200); // owners edit any
    });

    it('trends: one line per scale question across completed assessments; same reach as the answers', async () => {
      const open = (await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data[0];
      const answers = Object.fromEntries(WHEEL_OF_LIFE_QUESTIONS.map((q) => [q.id, 8]));
      await api('participant').post(`${base}/assessments/${open.id}/submit`, { answers }).expect(200);
      const trends = (await api('participant').get(`${base}/assessments/trends?clientMembershipId=${client()}`).expect(200)).body.data;
      expect(trends).toHaveLength(8);
      const health = trends.find((x: { questionId: string }) => x.questionId === 'health');
      expect(health.points.map((p: { value: number }) => p.value)).toEqual([4, 8]);
      expect(health.change).toBe(4);
      expect((await api('practitioner').get(`${base}/assessments/trends?clientMembershipId=${client()}`)).status).toBe(200);
      expect(code(await api('practitioner2').get(`${base}/assessments/trends?clientMembershipId=${client()}`))).toBe('NOT_FOUND');
      expect(code(await api('participant2').get(`${base}/assessments/trends?clientMembershipId=${client()}`))).toBe('NOT_FOUND');
    });

    it('cancelling the open request stops the repeats', async () => {
      const open = (await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data[0];
      expect(code(await api('participant').post(`${base}/assessments/${open.id}/cancel`, {}))).toBe('FORBIDDEN');
      expect((await api('practitioner').post(`${base}/assessments/${open.id}/cancel`, {}).expect(200)).body.data.status).toBe('CANCELLED');
      expect((await api('participant').get(`${base}/assessments?status=REQUESTED`).expect(200)).body.data).toEqual([]);
      expect(code(await api('practitioner').post(`${base}/assessments/${open.id}/cancel`, {}))).toBe('ASSESSMENT_NOT_OPEN');
    });
  });

  describe('resources', () => {
    it('a coach shares a link with all assigned clients; unassigned clients and other coaches do not see it', async () => {
      const before = await unread('participant');
      const res = await api('practitioner').post(`${base}/resources`, { title: 'Weekly planner', url: 'https://example.test/planner.pdf', description: 'Print it' }).expect(201);
      expect(res.body.data).toMatchObject({ sharedWithAll: true, url: 'https://example.test/planner.pdf', file: null });
      expect(await unread('participant')).toBe(before + 1);
      expect((await api('participant').get(`${base}/resources`).expect(200)).body.data.map((r: { title: string }) => r.title)).toContain('Weekly planner');
      expect((await api('participant2').get(`${base}/resources`).expect(200)).body.data).toEqual([]);
      expect((await api('practitioner2').get(`${base}/resources`).expect(200)).body.data).toEqual([]);
      expect((await api('owner').get(`${base}/resources`).expect(200)).body.data.length).toBeGreaterThan(0);
    });

    it('refuses unsafe or empty resources', async () => {
      expect((await api('practitioner').post(`${base}/resources`, { title: 'x', url: 'javascript:alert(1)' })).status).toBe(400);
      expect((await api('practitioner').post(`${base}/resources`, { title: 'x', url: 'ftp://example.test/a' })).status).toBe(400);
      expect((await api('practitioner').post(`${base}/resources`, { title: 'Nothing attached' })).status).toBe(400);
      expect(code(await api('participant').post(`${base}/resources`, { title: 'x', url: 'https://example.test' }))).toBe('FORBIDDEN');
      expect(code(await api('practitioner').post(`${base}/resources`, { title: 'x', url: 'https://example.test', clientMembershipId: F.participant2.membershipId }))).toBe('NOT_FOUND');
    });

    it('a shared file can be opened by exactly the people who can see the resource, and never after it is withdrawn', async () => {
      const file = await uploadFile(t, F.practitioner, F.orgId, PNG, 'image/png', 'worksheet.png');
      const download = (who: keyof OrgFixture) => api(who).get(`/api/v1/orgs/${F.orgId}/files/${file.id}/download-url`);
      const res = await api('practitioner').post(`${base}/resources`, { title: 'Worksheet', fileId: file.id, clientMembershipId: client() }).expect(201);
      expect(res.body.data.file).toMatchObject({ fileId: file.id, fileName: 'worksheet.png' });
      for (const who of ['practitioner', 'participant', 'owner'] as const) expect((await download(who)).status, who).toBe(200);
      for (const who of ['participant2', 'practitioner2', 'guardian'] as const) expect((await download(who)).status, who).toBe(404);
      // one resource per file; someone else’s file cannot be shared
      expect(code(await api('practitioner').post(`${base}/resources`, { title: 'Again', fileId: file.id }))).toBe('CONFLICT');
      const theirs = await uploadFile(t, F.practitioner2, F.orgId, PNG, 'image/png', 'theirs.png');
      expect((await api('practitioner').post(`${base}/resources`, { title: 'Theirs', fileId: theirs.id })).status).toBe(400);

      expect(code(await api('practitioner2').del(`${base}/resources/${res.body.data.id}`))).toBe('NOT_FOUND');
      await api('practitioner').del(`${base}/resources/${res.body.data.id}`).expect(204);
      expect((await download('participant')).status).toBe(404);
      expect((await api('participant').get(`${base}/resources`).expect(200)).body.data.map((r: { title: string }) => r.title)).not.toContain('Worksheet');
    });
  });

  describe('isolation between organizations', () => {
    it('nothing crosses into another organization, even with real ids', async () => {
      const other = await buildOrg(t, 'Other Studio', { categoryKey: 'coaching' });
      const oapi = (who: keyof OrgFixture) => as(t, other[who] as OrgFixture['owner']);
      const otherBase = `/api/v1/orgs/${other.orgId}/coaching`;
      const sessionId = (await api('practitioner').post(`${base}/sessions`, { clientMembershipId: client(), startsAt: inHours(40), durationMinutes: 30 }).expect(201)).body.data.id;
      // someone from the other organization cannot use this organization’s ids, and this organization’s people have no path into the other
      expect((await oapi('owner').get(`${otherBase}/sessions/${sessionId}`)).status).toBe(404);
      expect((await oapi('practitioner').post(`${otherBase}/sessions`, { clientMembershipId: client(), startsAt: inHours(30), durationMinutes: 30 })).status).toBe(404);
      expect((await oapi('owner').get(`${base}/sessions`)).status).toBe(404); // not a member here
      expect((await oapi('practitioner').get(`${otherBase}/notes?clientMembershipId=${client()}`)).status).toBe(404);
      expect(await t.prisma.coachSession.count({ where: { organizationId: other.orgId } })).toBe(0);
    });
  });
});
