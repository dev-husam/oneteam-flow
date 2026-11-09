import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, systemRoleId, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

describe('assignments, groups and audit trail', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Assign Gym');
    base = `/api/v1/orgs/${F.orgId}`;
  });
  afterAll(async () => t.app.close());

  describe('assignment rules', () => {
    it('one active PRIMARY per participant (database-enforced), many SECONDARY, history kept when ended', async () => {
      const m = as(t, F.manager);
      const first = await m.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner2.membershipId, participantMembershipId: F.participant2.membershipId });
      expect(first.status).toBe(201);
      expect(first.body.data.kind).toBe('PRIMARY');

      const dup = await m.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner.membershipId, participantMembershipId: F.participant2.membershipId });
      expect(dup.status).toBe(409);
      expect(code(dup)).toBe('ASSIGNMENT_EXISTS');

      const secondary = await m.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner.membershipId, participantMembershipId: F.participant2.membershipId, kind: 'SECONDARY' });
      expect(secondary.status).toBe(201);
      expect(code(await m.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner.membershipId, participantMembershipId: F.participant2.membershipId, kind: 'SECONDARY' }))).toBe('ASSIGNMENT_EXISTS');

      await m.post(`${base}/assignments/${first.body.data.id}/end`).expect(200);
      expect(code(await m.post(`${base}/assignments/${first.body.data.id}/end`))).toBe('NOT_FOUND'); // already ended
      // after ending, a new PRIMARY is possible and the old row stays as history
      await m.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner.membershipId, participantMembershipId: F.participant2.membershipId }).expect(201);
      const history = (await m.get(`${base}/assignments?active=false&participantMembershipId=${F.participant2.membershipId}`).expect(200)).body.data;
      expect(history.map((a: { id: string }) => a.id)).toEqual([first.body.data.id]);
      expect(history[0].endedAt).toBeTruthy();
    });

    it('validates who can be assigned', async () => {
      const m = as(t, F.manager);
      const post = (practitionerMembershipId: string, participantMembershipId: string) => m.post(`${base}/assignments`, { practitionerMembershipId, participantMembershipId });
      expect(code(await post(F.practitioner.membershipId, F.practitioner.membershipId))).toBe('ASSIGNMENT_INVALID'); // self
      expect(code(await post(F.participant.membershipId, F.practitioner2.membershipId))).toBe('ASSIGNMENT_INVALID'); // participant cannot supervise a practitioner
      expect(code(await post(F.practitioner.membershipId, F.practitioner2.membershipId))).toBe('ASSIGNMENT_INVALID'); // equal rank
      expect(code(await post(F.practitioner.membershipId, F.guardian.membershipId))).not.toBe('ASSIGNMENT_INVALID'); // rank rule only; guardian < practitioner
    });

    it('only organization-wide managers of assignments can change them; trainers cannot reassign clients', async () => {
      const res = await as(t, F.practitioner).post(`${base}/assignments`, { practitionerMembershipId: F.practitioner.membershipId, participantMembershipId: F.guardian.membershipId });
      expect(res.status).toBe(403);
    });
  });

  describe('groups', () => {
    it('create, rename, add and remove members, archive', async () => {
      const m = as(t, F.manager);
      const g = (await m.post(`${base}/groups`, { name: 'Morning class', description: '6am', typeKey: 'class' }).expect(201)).body.data;
      expect(g).toMatchObject({ name: 'Morning class', memberCount: 0, archived: false });
      await m.post(`${base}/groups/${g.id}/members`, { membershipId: F.participant.membershipId }).expect(200);
      const again = await m.post(`${base}/groups/${g.id}/members`, { membershipId: F.participant.membershipId }).expect(200); // idempotent
      expect(again.body.data.members).toHaveLength(1);
      expect((await m.patch(`${base}/groups/${g.id}`, { name: 'Early class' }).expect(200)).body.data.name).toBe('Early class');
      await m.del(`${base}/groups/${g.id}/members/${F.participant.membershipId}`).expect(204);
      expect((await m.del(`${base}/groups/${g.id}/members/${F.participant.membershipId}`)).status).toBe(404);
      await m.del(`${base}/groups/${g.id}`).expect(204);
      expect((await m.get(`${base}/groups`).expect(200)).body.data.some((x: { id: string }) => x.id === g.id)).toBe(false);
      expect((await m.patch(`${base}/groups/${g.id}`, { name: 'zombie' })).status).toBe(404); // archived groups are read-only
    });

    it('only active members can join and unknown fields are rejected', async () => {
      const m = as(t, F.manager);
      const g = (await m.post(`${base}/groups`, { name: 'Strict' }).expect(201)).body.data;
      await as(t, F.owner).post(`${base}/members/${F.guardian.membershipId}/suspend`).expect(200);
      expect(code(await m.post(`${base}/groups/${g.id}/members`, { membershipId: F.guardian.membershipId }))).toBe('GROUP_MEMBER_INVALID');
      await as(t, F.owner).post(`${base}/members/${F.guardian.membershipId}/reactivate`).expect(200);
      expect((await m.post(`${base}/groups`, { name: 'x', organizationId: 'other' })).status).toBe(400);
      expect((await m.post(`${base}/groups`, { name: 'x', createdByMembershipId: F.owner.membershipId })).status).toBe(400);
    });
  });

  describe('audit log', () => {
    it('records who did what, newest first, filterable and paginated', async () => {
      const owner = as(t, F.owner);
      const all = (await owner.get(`${base}/audit-logs?limit=100`).expect(200)).body.data;
      const actions = all.map((l: { action: string }) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['organization.created', 'invitation.created', 'invitation.accepted', 'assignment.created', 'assignment.ended', 'group.created', 'group.member_added', 'member.suspended', 'member.reactivated']));
      const ids = all.map((l: { id: string }) => l.id);
      expect([...ids].sort().reverse()).toEqual(ids); // newest first

      const members = (await owner.get(`${base}/audit-logs?action=member.`).expect(200)).body.data;
      expect(members.length).toBeGreaterThan(0);
      expect(members.every((l: { action: string }) => l.action.startsWith('member.'))).toBe(true);

      const p1 = (await owner.get(`${base}/audit-logs?limit=3`).expect(200)).body;
      expect(p1.data).toHaveLength(3);
      const p2 = (await owner.get(`${base}/audit-logs?limit=3&cursor=${p1.meta.nextCursor}`).expect(200)).body;
      expect(p2.data.map((l: { id: string }) => l.id)).not.toEqual(expect.arrayContaining(p1.data.map((l: { id: string }) => l.id)));
    });

    it('is readable only with audit.read and carries request correlation', async () => {
      expect((await as(t, F.manager).get(`${base}/audit-logs`)).status).toBe(403);
      const res = await as(t, F.owner).post(`${base}/groups`, { name: 'Correlated' }).set('x-request-id', 'audit-corr-123456').expect(201);
      expect(res.headers['x-request-id']).toBe('audit-corr-123456');
      const logs = (await as(t, F.owner).get(`${base}/audit-logs?action=group.created&limit=1`).expect(200)).body.data;
      expect(logs[0].requestId).toBe('audit-corr-123456');
      expect(logs[0].targetId).toBe(res.body.data.id);
    });

    it('platform-level auth events are not visible to organizations', async () => {
      const logs = (await as(t, F.owner).get(`${base}/audit-logs?action=auth.&limit=100`).expect(200)).body.data;
      expect(logs).toEqual([]);
      expect(await t.prisma.auditLog.count({ where: { action: 'auth.login', organizationId: null } })).toBeGreaterThan(0);
    });

    it('an audit row is rolled back together with a failed change', async () => {
      const before = await t.prisma.auditLog.count({ where: { organizationId: F.orgId } });
      const fresh = await systemRoleId(t, 'participant');
      // owner tries to demote the only owner (themself): refused, nothing written
      expect(code(await as(t, F.owner).post(`${base}/members/${F.owner.membershipId}/role`, { roleId: fresh }))).toBe('SELF_ACTION_FORBIDDEN');
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId } })).toBe(before);
    });
  });
});
