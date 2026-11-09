import { randomUUID } from 'node:crypto';
import { dateInTimeZone, isoWeekday, WHEEL_OF_LIFE_QUESTIONS } from '@pt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PNG, as, buildOrg, createMetric, createTestApp, systemRoleId, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';
import { discoverRoutes, type RouteInfo } from './helpers/routes.js';

/**
 * Two complete organizations. Everything a member of A does against B's data must come back as a plain 404,
 * and no list may ever contain B's rows.
 */
describe('tenant isolation', () => {
  let t: TestApp;
  let A: OrgFixture;
  let B: OrgFixture;
  const ids: Record<string, string> = {};
  let routes: RouteInfo[];

  beforeAll(async () => {
    t = await createTestApp();
    A = await buildOrg(t, 'Org A');
    B = await buildOrg(t, 'Org B');
    routes = discoverRoutes(t.app).filter((r) => r.path.includes(':orgId'));

    // Org B data that A must never reach.
    const b = as(t, B.owner);
    const group = await b.post(`/api/v1/orgs/${B.orgId}/groups`, { name: 'B group' }).expect(201);
    const role = await b.post(`/api/v1/orgs/${B.orgId}/roles`, { name: 'B custom', rank: 30, grants: [{ code: 'member.read', scope: 'ORG' }] }).expect(201);
    const invite = await b.post(`/api/v1/orgs/${B.orgId}/invitations`, { email: 'someone.b@example.test', roleId: await systemRoleId(t, 'participant') }).expect(201);
    const assignments = await b.get(`/api/v1/orgs/${B.orgId}/assignments`).expect(200);
    // Phase 5 data of org B: task + comment + attachment, metric + record + goal + milestone
    const task = await b.post(`/api/v1/orgs/${B.orgId}/tasks`, { title: 'B task', assigneeMembershipIds: [B.participant.membershipId] }).expect(201);
    const comment = await b.post(`/api/v1/orgs/${B.orgId}/tasks/${task.body.data.id}/comments`, { body: 'secret B comment' }).expect(201);
    const file = await uploadFile(t, B.owner, B.orgId, PNG, 'image/png', 'b-secret.png');
    const metric = await createMetric(t, B.owner, B.orgId, 'body_mass_kg');
    const record = await b.post(`/api/v1/orgs/${B.orgId}/progress/records`, { subjectMembershipId: B.participant.membershipId, metricId: metric.id, value: 90 }).expect(201);
    const goal = await b.post(`/api/v1/orgs/${B.orgId}/progress/goals`, { subjectMembershipId: B.participant.membershipId, metricId: metric.id, title: 'B goal', targetValue: 80 }).expect(201);
    const milestone = await b.post(`/api/v1/orgs/${B.orgId}/progress/goals/${goal.body.data.id}/milestones`, { title: 'B milestone' }).expect(201);
    // Phase 6a data of org B: custom exercise, published plan, assignment, session with a logged set
    const today = dateInTimeZone(new Date(), 'UTC');
    const exercise = (await b.post(`/api/v1/orgs/${B.orgId}/fitness/exercises`, { name: 'B secret move', muscleGroup: 'CHEST', equipment: 'BODYWEIGHT' }).expect(201)).body.data;
    const plan = (await b.post(`/api/v1/orgs/${B.orgId}/fitness/plans`, { name: 'B plan' }).expect(201)).body.data;
    const version = plan.versions[0].id;
    await b.put(`/api/v1/orgs/${B.orgId}/fitness/plans/${plan.id}/versions/${version}/content`, { days: [{ name: 'B day', exercises: [{ exerciseId: exercise.id, sets: 3, repsMin: 8, repsMax: 10, restSeconds: 60 }] }] }).expect(200);
    await b.post(`/api/v1/orgs/${B.orgId}/fitness/plans/${plan.id}/versions/${version}/publish`).expect(200);
    const assigned = (await b.post(`/api/v1/orgs/${B.orgId}/fitness/plans/${plan.id}/assignments`, { clientMembershipIds: [B.participant.membershipId], startDate: today, weeklySchedule: { '1': isoWeekday(today) } }).expect(201)).body.data;
    const assignment = (await b.get(`/api/v1/orgs/${B.orgId}/fitness/assignments/${assigned.assignments[0].id}`).expect(200)).body.data;
    const session = (await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/fitness/sessions`, { assignmentId: assignment.id, dayId: assignment.content.days[0].id }).expect(200)).body.data;
    Object.assign(ids, { exerciseId: exercise.id, planId: plan.id, versionId: version, workoutAssignmentId: assignment.id, sessionId: session.id, dayExerciseId: session.exercises[0].dayExerciseId, setNo: '1' });
    // Phase 6b data of org B: nutrition plan, assignment, a logged meal, a submitted check-in with a sensitive photo
    const nplan = (await b.post(`/api/v1/orgs/${B.orgId}/fitness/nutrition-plans`, { name: 'B nutrition' }).expect(201)).body.data;
    const nversion = nplan.versions[0].id;
    const allDays = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: [{ mealType: 'BREAKFAST', items: [{ name: 'B oats', calories: 300 }] }] }));
    await b.put(`/api/v1/orgs/${B.orgId}/fitness/nutrition-plans/${nplan.id}/versions/${nversion}/content`, { days: allDays }).expect(200);
    await b.post(`/api/v1/orgs/${B.orgId}/fitness/nutrition-plans/${nplan.id}/versions/${nversion}/publish`).expect(200);
    const nassign = (await b.post(`/api/v1/orgs/${B.orgId}/fitness/nutrition-plans/${nplan.id}/assignments`, { clientMembershipIds: [B.participant.membershipId], startDate: today }).expect(201)).body.data.assignments[0].id;
    const ntoday = (await as(t, B.participant).get(`/api/v1/orgs/${B.orgId}/fitness/nutrition/today`).expect(200)).body.data;
    const mealLog = (await as(t, B.participant).put(`/api/v1/orgs/${B.orgId}/fitness/nutrition/logs`, { assignmentId: nassign, mealId: ntoday.items[0].meals[0].mealId, status: 'COMPLETED' }).expect(200)).body.data;
    const checkin = (await as(t, B.participant).put(`/api/v1/orgs/${B.orgId}/fitness/checkins/week/current`, { measurements: { weight_kg: 81.5 } }).expect(200)).body.data;
    const sensitive = await (async () => {
      const req = await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/files/uploads`, { fileName: 'p.png', mimeType: 'image/png', sizeBytes: PNG.length, sensitivity: 'SENSITIVE' }).expect(201);
      await t.http().put(new URL(req.body.data.upload.url).pathname).set('Content-Type', 'image/png').send(PNG).expect(200);
      await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/files/${req.body.data.file.id}/complete`).expect(200);
      return req.body.data.file.id as string;
    })();
    const photoRes = await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/fitness/photos`, { fileId: sensitive, angle: 'FRONT', kind: 'WEEKLY', checkinId: checkin.id }).expect(201);
    await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/fitness/checkins/${checkin.id}/submit`).expect(200);
    Object.assign(ids, { nutritionPlanId: nplan.id, nutritionVersionId: nversion, nutritionAssignmentId: nassign, mealLogId: mealLog.id, checkinId: checkin.id, photoId: photoRes.body.data.photos[0].id, week: 'nope', photoFileId: sensitive });
    // Phase 7 data of org B: a conversation with a message that has an attachment
    const chatFile = await uploadFile(t, B.owner, B.orgId, PNG, 'image/png', 'b-chat.png');
    const conversation = (await b.post(`/api/v1/orgs/${B.orgId}/messaging/conversations`, { membershipId: B.participant.membershipId }).expect(201)).body.data;
    const chatMessage = (await b.post(`/api/v1/orgs/${B.orgId}/messaging/conversations/${conversation.id}/messages`, { body: 'secret B message', fileIds: [chatFile.id] }).expect(201)).body.data;
    const chatReport = (await as(t, B.participant).post(`/api/v1/orgs/${B.orgId}/messaging/conversations/${conversation.id}/messages/${chatMessage.id}/report`, { reason: 'OTHER' }).expect(201)).body.data;
    Object.assign(ids, { conversationId: conversation.id, messageId: chatMessage.id, reportId: chatReport.id });
    // Phase 8a data of org B: the Coaching module is switched on for both organizations; B has a session, a private note, a questionnaire, a request and a resource
    const coachingModule = await t.prisma.platformModule.findUniqueOrThrow({ where: { key: 'coaching' } });
    for (const org of [A, B]) await t.prisma.organizationModule.create({ data: { organizationId: org.orgId, moduleId: coachingModule.id, enabled: true } });
    const cb = `/api/v1/orgs/${B.orgId}/coaching`;
    const coachSession = (await b.post(`${cb}/sessions`, { clientMembershipId: B.participant.membershipId, startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), durationMinutes: 30 }).expect(201)).body.data;
    const coachNote = (await b.post(`${cb}/notes`, { clientMembershipId: B.participant.membershipId, visibility: 'PRIVATE', body: 'secret B coaching note' }).expect(201)).body.data;
    const coachTemplate = (await b.post(`${cb}/assessment-templates`, { name: 'B wheel', questions: WHEEL_OF_LIFE_QUESTIONS }).expect(201)).body.data;
    const coachAssessment = (await b.post(`${cb}/assessments`, { templateId: coachTemplate.id, clientMembershipId: B.participant.membershipId }).expect(201)).body.data;
    const coachResource = (await b.post(`${cb}/resources`, { title: 'B resource', url: 'https://b.example.test' }).expect(201)).body.data;
    Object.assign(ids, { coachSessionId: coachSession.id, noteId: coachNote.id, templateId: coachTemplate.id, assessmentId: coachAssessment.id, resourceId: coachResource.id });
    Object.assign(ids, {
      taskId: task.body.data.id, commentId: comment.body.data.id, fileId: file.id, recordId: record.body.data.id,
      goalId: goal.body.data.id, milestoneId: milestone.body.data.id, metricId: metric.id,
      memberId: B.participant.membershipId,
      membershipId: B.participant.membershipId,
      groupId: group.body.data.id,
      roleId: role.body.data.id,
      invitationId: invite.body.data.id,
      assignmentId: assignments.body.data[0].id,
    });
  });
  afterAll(async () => t.app.close());

  const url = (template: string, orgId: string) =>
    '/api/v1' + template.replace(':orgId', orgId).replace(/:(\w+)/g, (_m, name: string) => {
      const id = ids[name];
      if (!id) throw new Error(`Route ${template} has parameter :${name} without a fixture id: extend the isolation matrix`);
      return id;
    });

  const send = (route: RouteInfo, orgId: string, caller: OrgFixture['owner']) => {
    const api = as(t, caller);
    // a few GET routes have mandatory query parameters; validation runs before the lookup we want to test
    const path = url(route.path, orgId) + (/\/summary$/.test(route.path) && route.path.includes('/groups/') ? `?metricId=${ids.metricId}` : '');
    switch (route.method) {
      case 'GET': return api.get(path);
      case 'POST': return api.post(path, {});
      case 'PATCH': return api.patch(path, {});
      case 'PUT': return api.put(path, {});
      case 'DELETE': return api.del(path);
      default: throw new Error(`unsupported method ${route.method}`);
    }
  };

  it('every organization route answers 404 when the caller is not a member of the organization in the path', async () => {
    const results: string[] = [];
    for (const route of routes) {
      const res = await send(route, B.orgId, A.owner); // A's owner is a stranger to B
      if (res.status !== 404 || res.body.error?.code !== 'NOT_FOUND') results.push(`${route.method} ${route.path} → ${res.status} ${res.body.error?.code}`);
    }
    expect(results).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it('a nonexistent organization is indistinguishable from someone else’s', async () => {
    const stranger = await send(routes[0]!, B.orgId, A.owner);
    const ghost = await send(routes[0]!, randomUUID(), A.owner);
    expect(ghost.status).toBe(stranger.status);
    expect(ghost.body.error.code).toBe(stranger.body.error.code);
  });

  it('own organization + another organization’s resource ids: lookups and body-less actions are 404', async () => {
    const withParams = routes.filter((r) => /:(?!orgId)\w+/.test(r.path));
    const bodyless = withParams.filter((r) => r.method === 'GET' || r.method === 'DELETE' || /\/(suspend|reactivate|resend|end|achieve)$/.test(r.path));
    expect(bodyless.length).toBeGreaterThan(8);
    const failures: string[] = [];
    for (const route of bodyless) {
      const res = await send(route, A.orgId, A.owner);
      if (res.status !== 404) failures.push(`${route.method} ${route.path} → ${res.status} ${res.body.error?.code}`);
    }
    expect(failures).toEqual([]);
  });

  it('writes with another organization’s ids in the body are rejected', async () => {
    const a = as(t, A.owner);
    const base = `/api/v1/orgs/${A.orgId}`;
    const participantRole = await systemRoleId(t, 'participant');

    expect((await a.post(`${base}/members/${ids.memberId}/role`, { roleId: participantRole })).status).toBe(404);
    expect((await a.patch(`${base}/roles/${ids.roleId}`, { name: 'hijack' })).status).toBe(404);
    expect((await a.patch(`${base}/groups/${ids.groupId}`, { name: 'hijack' })).status).toBe(404);
    expect((await a.post(`${base}/groups/${ids.groupId}/members`, { membershipId: A.participant.membershipId })).status).toBe(404);

    const ownGroup = (await a.post(`${base}/groups`, { name: 'A group' }).expect(201)).body.data.id;
    const addForeign = await a.post(`${base}/groups/${ownGroup}/members`, { membershipId: B.participant.membershipId });
    expect(addForeign.body.error.code).toBe('GROUP_MEMBER_INVALID');

    const foreignAssign = await a.post(`${base}/assignments`, { practitionerMembershipId: A.practitioner.membershipId, participantMembershipId: B.participant.membershipId });
    expect(foreignAssign.body.error.code).toBe('ASSIGNMENT_INVALID');
    const foreignPractitioner = await a.post(`${base}/assignments`, { practitionerMembershipId: B.practitioner.membershipId, participantMembershipId: A.participant2.membershipId });
    expect(foreignPractitioner.body.error.code).toBe('ASSIGNMENT_INVALID');

    // A cannot hand out B's custom role, in direct role changes or in invitations
    const changeToForeignRole = await a.post(`${base}/members/${A.participant2.membershipId}/role`, { roleId: ids.roleId });
    expect(changeToForeignRole.body.error.code).toBe('ROLE_INVALID');
    const inviteForeignRole = await a.post(`${base}/invitations`, { email: 'x.a@example.test', roleId: ids.roleId });
    expect(inviteForeignRole.body.error.code).toBe('ROLE_INVALID');
    const inviteForeignAssignee = await a.post(`${base}/invitations`, { email: 'y.a@example.test', roleId: participantRole, assignToMembershipId: B.practitioner.membershipId });
    expect(inviteForeignAssignee.body.error.code).toBe('ASSIGNMENT_INVALID');
    const inviteForeignGroup = await a.post(`${base}/invitations`, { email: 'z.a@example.test', roleId: participantRole, groupIds: [ids.groupId] });
    expect(inviteForeignGroup.status).toBe(404);
  });

  it('lists contain only the caller’s own organization', async () => {
    const a = as(t, A.owner);
    const base = `/api/v1/orgs/${A.orgId}`;
    const memberIds = new Set((await a.get(`${base}/members?limit=100`).expect(200)).body.data.map((m: { id: string }) => m.id));
    for (const m of Object.values(B)) if (typeof m === 'object' && 'membershipId' in m) expect(memberIds.has(m.membershipId)).toBe(false);
    expect(memberIds.size).toBe(8);

    const groups = (await a.get(`${base}/groups`).expect(200)).body.data.map((g: { id: string }) => g.id);
    expect(groups).not.toContain(ids.groupId);
    const roles = (await a.get(`${base}/roles`).expect(200)).body.data.map((r: { id: string }) => r.id);
    expect(roles).not.toContain(ids.roleId);
    const invitations = (await a.get(`${base}/invitations`).expect(200)).body.data.map((i: { id: string }) => i.id);
    expect(invitations).not.toContain(ids.invitationId);
    const assignments = (await a.get(`${base}/assignments`).expect(200)).body.data.map((x: { id: string }) => x.id);
    expect(assignments).not.toContain(ids.assignmentId);
    const audit = (await a.get(`${base}/audit-logs?limit=100`).expect(200)).body.data;
    expect(audit.every((e: { metadata: unknown }) => !JSON.stringify(e.metadata ?? {}).includes(B.orgId))).toBe(true);
    const orgAudit = await t.prisma.auditLog.findMany({ where: { id: { in: audit.map((e: { id: string }) => e.id) } }, select: { organizationId: true } });
    expect(orgAudit.every((e) => e.organizationId === A.orgId)).toBe(true);
  });

  it('an account belongs to one organization only: invitations from another are refused and its paths stay closed', async () => {
    // A.owner is invited to B (a different organization): accepting must fail, nothing changes.
    await as(t, B.owner).post(`/api/v1/orgs/${B.orgId}/invitations`, { email: A.owner.email, roleId: await systemRoleId(t, 'participant') }).expect(201);
    const { waitForMail, tokenFromMail } = await import('./helpers/app.js');
    const mail = await waitForMail((m) => m.to === A.owner.email && m.subject.includes('Org B'));
    const refused = await as(t, A.owner).post('/api/v1/invitations/accept', { token: tokenFromMail(mail) });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ALREADY_IN_ORGANIZATION');

    // Owner powers in A never reach B: every B path is closed to them.
    for (const path of ['context', 'roles', 'members']) {
      const res = await as(t, A.owner).get(`/api/v1/orgs/${B.orgId}/${path}`);
      expect(res.status, path).toBe(404); // a non-member cannot even learn the organization exists
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const mine = (await as(t, A.owner).get('/api/v1/me/organizations').expect(200)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0].organization.id).toBe(A.orgId);
  });
});

describe('tenant isolation: shared capabilities', () => {
  let t: TestApp;
  let A: OrgFixture;
  let B: OrgFixture;
  const bIds: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    A = await buildOrg(t, 'Cap A');
    B = await buildOrg(t, 'Cap B');
    const b = as(t, B.owner);
    const task = await b.post(`/api/v1/orgs/${B.orgId}/tasks`, { title: 'B only', assigneeMembershipIds: [B.participant.membershipId] }).expect(201);
    const metric = await createMetric(t, B.owner, B.orgId, 'body_mass_kg');
    const rec = await b.post(`/api/v1/orgs/${B.orgId}/progress/records`, { subjectMembershipId: B.participant.membershipId, metricId: metric.id, value: 91 }).expect(201);
    const file = await uploadFile(t, B.owner, B.orgId, PNG, 'image/png');
    Object.assign(bIds, { task: task.body.data.id, metric: metric.id, record: rec.body.data.id, file: file.id });
  });
  afterAll(async () => t.app.close());

  it('A cannot read, change, comment on, or attach to B’s task, even as owner', async () => {
    const a = as(t, A.owner);
    const base = `/api/v1/orgs/${A.orgId}/tasks/${bIds.task}`;
    expect((await a.get(base)).status).toBe(404);
    expect((await a.patch(base, { version: 1, title: 'hijack' })).status).toBe(404);
    expect((await a.post(`${base}/comments`, { body: 'x' })).status).toBe(404);
    expect((await a.post(`${base}/status`, { status: 'DONE' })).status).toBe(404);
    expect((await a.del(base)).status).toBe(404);
    expect((await a.get(`${base}/history`)).status).toBe(404);
    const own = (await a.get(`/api/v1/orgs/${A.orgId}/tasks?limit=100`).expect(200)).body.data.map((x: { id: string }) => x.id);
    expect(own).not.toContain(bIds.task);
  });

  it('A cannot assign B’s members to tasks, record progress for them, or see their series', async () => {
    const a = as(t, A.owner);
    expect((await a.post(`/api/v1/orgs/${A.orgId}/tasks`, { title: 'xx', assigneeMembershipIds: [B.participant.membershipId] })).body.error.code).toBe('ASSIGNMENT_INVALID');
    expect((await a.post(`/api/v1/orgs/${A.orgId}/progress/records`, { subjectMembershipId: B.participant.membershipId, metricId: bIds.metric, value: 1 })).status).toBe(404);
    expect((await a.get(`/api/v1/orgs/${A.orgId}/progress/records?subjectMembershipId=${B.participant.membershipId}`)).status).toBe(404);
    expect((await a.post(`/api/v1/orgs/${A.orgId}/progress/records/${bIds.record}/void`, { reason: 'nope' })).status).toBe(404);
  });

  it('B’s custom metric is invisible to A, and A cannot use its id', async () => {
    const a = as(t, A.owner);
    const metrics = (await a.get(`/api/v1/orgs/${A.orgId}/progress/metrics`).expect(200)).body.data.map((m: { id: string }) => m.id);
    expect(metrics).not.toContain(bIds.metric);
    const res = await a.post(`/api/v1/orgs/${A.orgId}/progress/records`, { subjectMembershipId: A.participant.membershipId, metricId: bIds.metric, value: 1 });
    expect(res.status).toBe(404);
  });

  it('A cannot download, attach or delete B’s file; ids from another organization simply do not exist', async () => {
    const a = as(t, A.owner);
    const base = `/api/v1/orgs/${A.orgId}/files/${bIds.file}`;
    expect((await a.get(base)).status).toBe(404);
    expect((await a.get(`${base}/download-url`)).status).toBe(404);
    expect((await a.del(base)).status).toBe(404);
    const ownTask = (await a.post(`/api/v1/orgs/${A.orgId}/tasks`, { title: 'mine' }).expect(201)).body.data.id;
    expect((await a.post(`/api/v1/orgs/${A.orgId}/tasks/${ownTask}/attachments`, { fileId: bIds.file })).status).toBe(404);
  });

  it('the database refuses cross-organization task links written with raw SQL', async () => {
    const taskB = bIds.task;
    const sql = 'INSERT INTO task_assignments (id, organization_id, task_id, assignee_membership_id, status, created_at, updated_at) VALUES (UUID(), ?, ?, ?, \'PENDING\', NOW(3), NOW(3))';
    await expect(t.prisma.$executeRawUnsafe(sql, A.orgId, taskB, A.participant.membershipId)).rejects.toThrow(); // task of B under org A
    await expect(t.prisma.$executeRawUnsafe(sql, B.orgId, taskB, A.participant.membershipId)).rejects.toThrow(); // assignee of A under org B
    const fileSql = 'INSERT INTO task_attachments (task_id, file_id, organization_id, created_at) VALUES (?, ?, ?, NOW(3))';
    await expect(t.prisma.$executeRawUnsafe(fileSql, taskB, bIds.file, A.orgId)).rejects.toThrow();
  });

  it('notifications of one user never include another organization’s tasks for people who are not members', async () => {
    const stranger = await as(t, A.participant).get('/api/v1/me/notifications').expect(200);
    expect(JSON.stringify(stranger.body)).not.toContain('B only');
  });
});
