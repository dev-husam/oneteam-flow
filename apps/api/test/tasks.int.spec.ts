import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDF, PNG, as, buildOrg, createTestApp, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;

describe('tasks', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Tasks Gym');
    base = `/api/v1/orgs/${F.orgId}/tasks`;
  });
  afterAll(async () => t.app.close());

  const create = async (who: keyof OrgFixture, body: object) => as(t, F[who] as OrgFixture['owner']).post(base, body);

  describe('creating and assigning', () => {
    it('a task without assignees is a personal to-do for its creator', async () => {
      const res = await create('practitioner', { title: 'Plan next week' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ title: 'Plan next week', status: 'OPEN', priority: 'MEDIUM', version: 1, myStatus: 'PENDING' });
      expect(res.body.data.assignees.map((a: { membershipId: string }) => a.membershipId)).toEqual([F.practitioner.membershipId]);
    });

    it('trainers assign tasks to their own clients only', async () => {
      const ok = await create('practitioner', { title: 'Log your meals', assigneeMembershipIds: [F.participant.membershipId], priority: 'HIGH', dueAt: '2030-01-01T10:00:00.000Z' });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ priority: 'HIGH', createdByName: 'Test User' });
      for (const other of [F.participant2.membershipId, F.practitioner2.membershipId, F.owner.membershipId]) {
        const res = await create('practitioner', { title: 'Nope', assigneeMembershipIds: [other] });
        expect(code(res)).toBe('ASSIGNMENT_INVALID');
      }
    });

    it('managers assign to anyone; participants and guardians cannot create tasks', async () => {
      expect((await create('manager', { title: 'Welcome call', assigneeMembershipIds: [F.participant2.membershipId, F.practitioner.membershipId] })).status).toBe(201);
      expect(code(await create('participant', { title: 'x1', assigneeMembershipIds: [F.participant.membershipId] }))).toBe('FORBIDDEN');
      expect(code(await create('guardian', { title: 'x2' }))).toBe('FORBIDDEN');
    });

    it('expands groups into individual assignments and validates input', async () => {
      const group = (await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'Task group' }).expect(201)).body.data.id;
      await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups/${group}/members`, { membershipId: F.participant.membershipId }).expect(200);
      await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups/${group}/members`, { membershipId: F.participant2.membershipId }).expect(200);
      const res = await create('manager', { title: 'Class homework', groupIds: [group] });
      expect(res.status).toBe(201);
      expect(res.body.data.assignees).toHaveLength(2);
      const rows = await t.prisma.taskAssignment.findMany({ where: { taskId: res.body.data.id } });
      expect(rows.every((r) => r.sourceGroupId === group)).toBe(true);

      expect((await create('manager', { title: 'a' })).status).toBe(400); // too short
      expect((await create('manager', { title: 'ok title', priority: 'URGENTISH' })).status).toBe(400);
      expect((await create('manager', { title: 'ok title', status: 'DONE' })).status).toBe(400); // mass assignment
      expect((await create('manager', { title: 'ok title', organizationId: 'x' })).status).toBe(400);
    });
  });

  describe('visibility', () => {
    let task: string;
    beforeAll(async () => {
      task = (await create('practitioner', { title: 'Private to P1 and client', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
    });

    it('creators, assignees and wider scopes see it; everyone else gets a plain 404', async () => {
      for (const who of ['practitioner', 'participant', 'manager', 'owner'] as const) expect((await as(t, F[who]).get(`${base}/${task}`)).status, who).toBe(200);
      for (const who of ['practitioner2', 'participant2'] as const) {
        const res = await as(t, F[who]).get(`${base}/${task}`);
        expect(res.status, who).toBe(404);
        expect(code(res)).toBe('NOT_FOUND');
      }
      expect(code(await as(t, F.guardian).get(`${base}/${task}`))).toBe('FORBIDDEN'); // guardians hold no task permission at all
    });

    it('lists contain exactly the visible tasks', async () => {
      const ids = async (who: keyof OrgFixture) => (await as(t, F[who] as OrgFixture['owner']).get(`${base}?limit=100`).expect(200)).body.data.map((x: { id: string }) => x.id);
      expect(await ids('participant')).toContain(task);
      expect(await ids('participant2')).not.toContain(task);
      expect(await ids('practitioner2')).not.toContain(task);
      expect(await ids('manager')).toContain(task);
      expect((await as(t, F.guardian).get(base)).status).toBe(403); // no task.read at all
    });

    it('filters by status, assignee, search and overdue', async () => {
      const overdue = (await create('manager', { title: 'Overdue thing', assigneeMembershipIds: [F.participant.membershipId], dueAt: '2020-01-01T00:00:00.000Z' })).body.data.id;
      const q = async (query: string) => (await as(t, F.participant).get(`${base}?${query}`).expect(200)).body.data.map((x: { id: string }) => x.id);
      expect(await q('overdue=true')).toContain(overdue);
      expect(await q('overdue=true')).not.toContain(task);
      expect(await q('assignee=me&q=Overdue')).toEqual([overdue]);
      expect(await q('status=DONE')).not.toContain(task);
      expect((await as(t, F.participant).get(`${base}?status=BOGUS`)).status).toBe(400);
    });
  });

  describe('progress by the assignee', () => {
    it('derives the task status from its assignees and notifies the creator', async () => {
      const group = (await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups`, { name: 'Derive group' }).expect(201)).body.data.id;
      for (const m of [F.participant, F.participant2]) await as(t, F.manager).post(`/api/v1/orgs/${F.orgId}/groups/${group}/members`, { membershipId: m.membershipId }).expect(200);
      const id = (await create('manager', { title: 'Everyone stretches', groupIds: [group] })).body.data.id;
      const set = (who: keyof OrgFixture, status: string) => as(t, F[who] as OrgFixture['owner']).post(`${base}/${id}/status`, { status });

      expect((await set('participant', 'IN_PROGRESS')).body.data).toMatchObject({ status: 'IN_PROGRESS', myStatus: 'IN_PROGRESS' });
      expect((await set('participant', 'DONE')).body.data.status).toBe('IN_PROGRESS'); // one of two
      const done = await set('participant2', 'DONE');
      expect(done.body.data.status).toBe('DONE');
      expect(done.body.data.completedAt).toBeTruthy();
      // reopening one assignee reopens the task
      expect((await set('participant2', 'PENDING')).body.data.status).toBe('IN_PROGRESS');

      const notes = await t.prisma.notification.findMany({ where: { userId: F.manager.userId, typeKey: 'task.completed' } });
      expect(notes.length).toBeGreaterThanOrEqual(1);
    });

    it('only assignees can report progress; cancelled tasks are frozen', async () => {
      const id = (await create('practitioner', { title: 'Hydrate daily', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      expect(code(await as(t, F.practitioner2).post(`${base}/${id}/status`, { status: 'DONE' }))).toBe('NOT_FOUND'); // cannot even see it
      expect(code(await as(t, F.manager).post(`${base}/${id}/status`, { status: 'DONE' }))).toBe('FORBIDDEN'); // sees it, is not an assignee
      expect((await as(t, F.participant).post(`${base}/${id}/status`, { status: 'BOGUS' })).status).toBe(400);
      const v = (await as(t, F.participant).get(`${base}/${id}`).expect(200)).body.data.version;
      await as(t, F.practitioner).patch(`${base}/${id}`, { version: v, status: 'CANCELLED' }).expect(200);
      expect(code(await as(t, F.participant).post(`${base}/${id}/status`, { status: 'DONE' }))).toBe('CONFLICT');
    });
  });

  describe('editing with optimistic concurrency', () => {
    it('rejects a stale version instead of overwriting, and bumps the version on success', async () => {
      const id = (await create('practitioner', { title: 'Edit me', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      const p = as(t, F.practitioner);
      const first = await p.patch(`${base}/${id}`, { version: 1, title: 'Edited once', priority: 'URGENT', dueAt: '2031-05-05T00:00:00.000Z' }).expect(200);
      expect(first.body.data).toMatchObject({ title: 'Edited once', priority: 'URGENT', version: 2 });
      const stale = await p.patch(`${base}/${id}`, { version: 1, title: 'Lost update' });
      expect(stale.status).toBe(409);
      expect(code(stale)).toBe('CONFLICT');
      expect((await p.get(`${base}/${id}`).expect(200)).body.data.title).toBe('Edited once');
      expect((await p.patch(`${base}/${id}`, { version: 2, dueAt: null }).expect(200)).body.data.dueAt).toBeNull();
      expect((await p.patch(`${base}/${id}`, { title: 'no version' })).status).toBe(400);
    });

    it('editing needs task.manage on that task: creators and managers yes, others no', async () => {
      const id = (await create('manager', { title: 'Manager task', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      // trainer sees it (assigned client) but did not create it: visible, not editable
      expect(code(await as(t, F.practitioner).patch(`${base}/${id}`, { version: 1, title: 'x2' }))).toBe('FORBIDDEN');
      expect(code(await as(t, F.participant).patch(`${base}/${id}`, { version: 1, title: 'x2' }))).toBe('FORBIDDEN');
      expect(code(await as(t, F.practitioner2).patch(`${base}/${id}`, { version: 1, title: 'x2' }))).toBe('NOT_FOUND');
      await as(t, F.owner).patch(`${base}/${id}`, { version: 1, title: 'Owner edit' }).expect(200);
    });

    it('cancel and reopen; delete is soft and final for everyone', async () => {
      const id = (await create('practitioner', { title: 'Lifecycle', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      const p = as(t, F.practitioner);
      expect((await p.patch(`${base}/${id}`, { version: 1, status: 'CANCELLED' }).expect(200)).body.data.status).toBe('CANCELLED');
      expect((await p.patch(`${base}/${id}`, { version: 2, status: 'OPEN' }).expect(200)).body.data.status).toBe('OPEN');
      await p.del(`${base}/${id}`).expect(204);
      for (const who of ['practitioner', 'participant', 'owner'] as const) expect((await as(t, F[who]).get(`${base}/${id}`)).status).toBe(404);
      expect((await t.prisma.task.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    });

    it('assignees can be added and removed later', async () => {
      const id = (await create('manager', { title: 'Grow the team', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      const added = await as(t, F.manager).post(`${base}/${id}/assignees`, { assigneeMembershipIds: [F.participant2.membershipId, F.participant.membershipId] }).expect(200);
      expect(added.body.data.assignees).toHaveLength(2); // no duplicates
      await as(t, F.manager).del(`${base}/${id}/assignees/${F.participant.membershipId}`).expect(204);
      expect((await as(t, F.participant).get(`${base}/${id}`)).status).toBe(404); // lost access with the assignment
      expect((await as(t, F.participant2).get(`${base}/${id}`).expect(200)).body.data.assignees).toHaveLength(1);
    });
  });

  describe('comments', () => {
    let id: string;
    beforeAll(async () => {
      id = (await create('practitioner', { title: 'Discuss me', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
    });

    it('participants of the task can comment; everyone else is shut out', async () => {
      const c = await as(t, F.participant).post(`${base}/${id}/comments`, { body: '  Done with set one  ' }).expect(201);
      expect(c.body.data).toMatchObject({ body: 'Done with set one', authorName: 'Test User', edited: false });
      await as(t, F.practitioner).post(`${base}/${id}/comments`, { body: 'Great!' }).expect(201);
      expect((await as(t, F.practitioner2).post(`${base}/${id}/comments`, { body: 'hi' })).status).toBe(404);
      expect((await as(t, F.practitioner2).get(`${base}/${id}/comments`)).status).toBe(404);
      expect((await as(t, F.participant).post(`${base}/${id}/comments`, { body: '' })).status).toBe(400);
      const list = (await as(t, F.participant).get(`${base}/${id}/comments`).expect(200)).body.data;
      expect(list.map((x: { body: string }) => x.body)).toEqual(['Done with set one', 'Great!']);
    });

    it('authors edit and delete their own; moderators can delete; others cannot', async () => {
      const mine = (await as(t, F.participant).post(`${base}/${id}/comments`, { body: 'typo' }).expect(201)).body.data.id;
      expect((await as(t, F.participant).patch(`${base}/${id}/comments/${mine}`, { body: 'fixed' }).expect(200)).body.data).toMatchObject({ body: 'fixed', edited: true });
      expect(code(await as(t, F.practitioner).patch(`${base}/${id}/comments/${mine}`, { body: 'hijack' }))).toBe('FORBIDDEN');
      expect(code(await as(t, F.practitioner).del(`${base}/${id}/comments/${mine}`))).toBe('FORBIDDEN'); // task.manage is OWN for trainers
      await as(t, F.manager).del(`${base}/${id}/comments/${mine}`).expect(204);
      const left = (await as(t, F.participant).get(`${base}/${id}/comments`).expect(200)).body.data.map((c: { id: string }) => c.id);
      expect(left).not.toContain(mine);
    });

    it('notifies the other people on the task', async () => {
      const before = await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'task.comment' } });
      await as(t, F.participant).post(`${base}/${id}/comments`, { body: 'Question about reps' }).expect(201);
      expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId, typeKey: 'task.comment' } })).toBe(before + 1);
      expect(await t.prisma.notification.count({ where: { userId: F.participant.userId, typeKey: 'task.comment', params: { path: '$.actor', equals: 'Test User' } as never } })).toBeGreaterThanOrEqual(0);
    });
  });

  describe('attachments', () => {
    it('only the uploader attaches a finished upload; assignees can download it, outsiders cannot', async () => {
      const id = (await create('practitioner', { title: 'Read the plan', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
      const pdf = await uploadFile(t, F.practitioner, F.orgId, PDF, 'application/pdf', 'plan.pdf');
      await as(t, F.practitioner).post(`${base}/${id}/attachments`, { fileId: pdf.id }).expect(204);
      await as(t, F.practitioner).post(`${base}/${id}/attachments`, { fileId: pdf.id }).expect(204); // idempotent

      expect((await as(t, F.participant).post(`${base}/${id}/attachments`, { fileId: pdf.id })).status).toBe(404); // not their upload
      const detail = (await as(t, F.participant).get(`${base}/${id}`).expect(200)).body.data;
      expect(detail.attachments).toEqual([{ fileId: pdf.id, name: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length }]);

      const files = `/api/v1/orgs/${F.orgId}/files/${pdf.id}`;
      expect((await as(t, F.participant).get(`${files}/download-url`)).status).toBe(200);
      expect((await as(t, F.practitioner2).get(`${files}/download-url`)).status).toBe(404);
      expect((await as(t, F.participant2).get(files)).status).toBe(404);

      const png = await uploadFile(t, F.participant, F.orgId, PNG, 'image/png', 'photo.png');
      await as(t, F.participant).post(`${base}/${id}/attachments`, { fileId: png.id }).expect(204);
      expect(code(await as(t, F.practitioner).del(`${base}/${id}/attachments/${png.id}`))).toBe('FORBIDDEN'); // not theirs, trainers do not moderate
      await as(t, F.participant).del(`${base}/${id}/attachments/${png.id}`).expect(204);
      await as(t, F.manager).del(`${base}/${id}/attachments/${pdf.id}`).expect(204); // moderators can
    });
  });

  it('keeps a readable history of what happened', async () => {
    const id = (await create('practitioner', { title: 'History task', assigneeMembershipIds: [F.participant.membershipId] })).body.data.id;
    await as(t, F.participant).post(`${base}/${id}/status`, { status: 'IN_PROGRESS' }).expect(200);
    await as(t, F.participant).post(`${base}/${id}/comments`, { body: 'started' }).expect(201);
    await as(t, F.participant).post(`${base}/${id}/status`, { status: 'DONE' }).expect(200);
    const history = (await as(t, F.practitioner).get(`${base}/${id}/history`).expect(200)).body.data;
    expect(history.map((h: { verb: string }) => h.verb)).toEqual(['task.created', 'task.in_progress', 'task.commented', 'task.done']);
    expect(history[1]).toMatchObject({ actorName: 'Test User' });
    expect((await as(t, F.practitioner2).get(`${base}/${id}/history`)).status).toBe(404);
    const feed = (await as(t, F.practitioner).get(`/api/v1/orgs/${F.orgId}/activity?limit=100`).expect(200)).body.data;
    expect(feed.some((e: { entityId: string }) => e.entityId === id)).toBe(true);
    const clientFeed = (await as(t, F.participant2).get(`/api/v1/orgs/${F.orgId}/activity?limit=100`).expect(200)).body.data;
    expect(clientFeed.some((e: { entityId: string }) => e.entityId === id)).toBe(false);
  });
});
