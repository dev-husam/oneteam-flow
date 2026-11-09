import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, addMember, buildOrg, createTestApp, systemRoleId, uniqueEmail, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

describe('privilege escalation', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  let roleId: Record<string, string>;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t);
    base = `/api/v1/orgs/${F.orgId}`;
    roleId = Object.fromEntries(await Promise.all(['owner', 'admin', 'manager', 'practitioner', 'guardian', 'participant'].map(async (k) => [k, await systemRoleId(t, k)])));
  });
  afterAll(async () => t.app.close());

  describe('invitations', () => {
    it('can only hand out roles ranked below your own', async () => {
      const p = as(t, F.practitioner);
      expect(code(await p.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.owner }))).toBe('PRIVILEGE_ESCALATION');
      expect(code(await p.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.practitioner }))).toBe('PRIVILEGE_ESCALATION'); // equal rank
      expect((await p.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.participant })).status).toBe(201);

      const o = as(t, F.owner);
      expect((await o.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.owner })).status).toBe(201);
      expect((await o.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.practitioner })).status).toBe(201);
    });

    it('retired roles (admin, manager) cannot be handed out by anyone, owners included', async () => {
      for (const who of [F.owner, F.admin, F.practitioner]) {
        for (const r of ['admin', 'manager']) {
          const res = await as(t, who).post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId[r] });
          expect(code(res), r).toBe('ROLE_INVALID');
          expect(res.body.error.details).toMatchObject({ reason: 'retired' });
        }
      }
      // nor can an existing member be moved into one
      expect(code(await as(t, F.owner).post(`${base}/members/${F.participant2.membershipId}/role`, { roleId: roleId.manager }))).toBe('ROLE_INVALID');
      // and the role pickers do not offer them
      const offered = (await as(t, F.owner).get(`${base}/assignable-roles`).expect(200)).body.data.map((r: { key: string }) => r.key).sort();
      expect(offered).toEqual(['guardian', 'owner', 'participant', 'practitioner'].sort());
    });

    it('a trainer can invite only participants, and they are assigned to the trainer automatically', async () => {
      const p = as(t, F.practitioner);
      for (const r of ['practitioner', 'owner']) {
        expect(code(await p.post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId[r] })), r).toBe('PRIVILEGE_ESCALATION');
      }
      const client = await addMember(t, F.orgId, F.practitioner, 'participant');
      const assignment = await t.prisma.memberAssignment.findFirstOrThrow({ where: { participantMembershipId: client.membershipId, endedAt: null } });
      expect(assignment.practitionerMembershipId).toBe(F.practitioner.membershipId);
      await p.get(`${base}/members/${client.membershipId}`).expect(200);
      expect((await as(t, F.practitioner2).get(`${base}/members/${client.membershipId}`)).status).toBe(404);
    });

    it('a trainer cannot assign the invitee to a colleague, nor invite on someone else’s behalf', async () => {
      const res = await as(t, F.practitioner).post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.participant, assignToMembershipId: F.practitioner2.membershipId });
      expect(res.status).toBe(403);
      expect(code(res)).toBe('FORBIDDEN');
      // the owner may assign to any trainer
      expect((await as(t, F.owner).post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.participant, assignToMembershipId: F.practitioner2.membershipId })).status).toBe(201);
      // the assignee must outrank the invitee
      expect(code(await as(t, F.owner).post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.practitioner, assignToMembershipId: F.participant.membershipId }))).toBe('ASSIGNMENT_INVALID');
    });

    it('participants and guardians cannot invite at all', async () => {
      for (const who of [F.participant, F.guardian]) {
        expect(code(await as(t, who).post(`${base}/invitations`, { email: uniqueEmail(), roleId: roleId.participant }))).toBe('FORBIDDEN');
      }
    });
  });

  describe('changing roles of existing members', () => {
    it('cannot touch members of equal or higher rank', async () => {
      const a = as(t, F.admin);
      expect(code(await a.post(`${base}/members/${F.owner.membershipId}/role`, { roleId: roleId.participant }))).toBe('MEMBER_RANK_TOO_HIGH');
      expect(code(await a.post(`${base}/members/${F.owner.membershipId}/suspend`))).toBe('MEMBER_RANK_TOO_HIGH');
      expect(code(await a.del(`${base}/members/${F.owner.membershipId}`))).toBe('MEMBER_RANK_TOO_HIGH');
      const m = as(t, F.manager);
      expect(code(await m.post(`${base}/members/${F.admin.membershipId}/role`, { roleId: roleId.participant }))).toBe('FORBIDDEN'); // manager lacks member.update_role entirely
    });

    it('an admin-ranked actor cannot promote anyone to owner or to a retired role, nor change themselves', async () => {
      const a = as(t, F.admin);
      expect(code(await a.post(`${base}/members/${F.manager.membershipId}/role`, { roleId: roleId.owner }))).toBe('PRIVILEGE_ESCALATION');
      expect(code(await a.post(`${base}/members/${F.manager.membershipId}/role`, { roleId: roleId.admin }))).toBe('ROLE_INVALID');
      expect(code(await a.post(`${base}/members/${F.admin.membershipId}/role`, { roleId: roleId.owner }))).toBe('SELF_ACTION_FORBIDDEN');
      expect(code(await a.post(`${base}/members/${F.admin.membershipId}/suspend`))).toBe('SELF_ACTION_FORBIDDEN');
      // legitimate change below their rank works
      const fresh = await addMember(t, F.orgId, F.owner, 'participant');
      const res = await a.post(`${base}/members/${fresh.membershipId}/role`, { roleId: roleId.practitioner });
      expect(res.status).toBe(200);
      expect(res.body.data.role.key).toBe('practitioner');
    });

    it('ownership: only owners create owners; the last owner is protected; transfer works', async () => {
      const f = await buildOrg(t, 'Ownership Gym');
      const b = `/api/v1/orgs/${f.orgId}`;
      const owner = as(t, f.owner);

      expect(code(await owner.post(`${b}/leave`))).toBe('LAST_OWNER');
      expect(code(await owner.post(`${b}/members/${f.owner.membershipId}/role`, { roleId: roleId.admin }))).toBe('SELF_ACTION_FORBIDDEN');

      const promoted = await owner.post(`${b}/members/${f.admin.membershipId}/role`, { roleId: roleId.owner });
      expect(promoted.status).toBe(200);
      expect(promoted.body.data.role.key).toBe('owner');

      // two owners: the first may now step down, via the second
      const second = as(t, f.admin);
      const demoted = await second.post(`${b}/members/${f.owner.membershipId}/role`, { roleId: roleId.practitioner });
      expect(demoted.status).toBe(200);
      expect((await as(t, f.owner).get(`${b}/roles`)).status).toBe(403); // a trainer does not read roles
      expect(code(await as(t, f.owner).post(`${b}/members/${f.admin.membershipId}/role`, { roleId: roleId.participant }))).toBe('FORBIDDEN');

      // the remaining owner cannot leave
      expect(code(await second.post(`${b}/leave`))).toBe('LAST_OWNER');
      // a second owner can leave
      await second.post(`${b}/members/${f.owner.membershipId}/role`, { roleId: roleId.owner }).expect(200);
      await as(t, f.owner).post(`${b}/leave`).expect(204);
      expect((await as(t, f.owner).get(`${b}/context`)).status).toBe(404);
    });

    it('a failed protected action leaves no audit trace and changes nothing', async () => {
      const f = await buildOrg(t, 'No Trace Gym');
      const before = await t.prisma.auditLog.count({ where: { organizationId: f.orgId } });
      await as(t, f.owner).post(`/api/v1/orgs/${f.orgId}/leave`).expect(409);
      expect(await t.prisma.auditLog.count({ where: { organizationId: f.orgId } })).toBe(before);
      expect((await t.prisma.membership.findUniqueOrThrow({ where: { id: f.owner.membershipId } })).status).toBe('ACTIVE');
    });
  });

  describe('custom roles', () => {
    let roleAdmin: Awaited<ReturnType<typeof addMember>>;
    beforeAll(async () => {
      // A custom "role admin" (rank 70): can manage roles and invite, but does NOT hold audit.read or org.settings.update.
      const created = await as(t, F.owner).post(`${base}/roles`, {
        name: 'Role Admin', rank: 70,
        grants: [{ code: 'role.read', scope: 'ORG' }, { code: 'role.manage', scope: 'ORG' }, { code: 'member.read', scope: 'ORG' }, { code: 'member.invite', scope: 'ORG' }, { code: 'member.update_role', scope: 'ORG' }],
      });
      expect(created.status).toBe(201);
      roleAdmin = await addMember(t, F.orgId, F.owner, 'custom', { roleId: created.body.data.id });
    });

    it('cannot create a role containing a permission you do not hold', async () => {
      const ra = as(t, roleAdmin);
      const res = await ra.post(`${base}/roles`, { name: 'Sneaky', rank: 20, grants: [{ code: 'audit.read', scope: 'ORG' }] });
      expect(res.status).toBe(403);
      expect(code(res)).toBe('PRIVILEGE_ESCALATION');
      expect(res.body.error.details.permissions).toEqual(['audit.read']);
      // cloning a richer template is also an escalation
      expect(code(await ra.post(`${base}/roles`, { name: 'Clone', rank: 20, templateRoleId: roleId.admin }))).toBe('PRIVILEGE_ESCALATION');
    });

    it('cannot grant a wider scope than you hold, and cannot create a role at or above your rank', async () => {
      const f = await buildOrg(t, 'Scope Gym');
      const b = `/api/v1/orgs/${f.orgId}`;
      const narrow = (await as(t, f.owner).post(`${b}/roles`, { name: 'Narrow Admin', rank: 65, grants: [{ code: 'role.manage', scope: 'ORG' }, { code: 'role.read', scope: 'ORG' }, { code: 'member.read', scope: 'ASSIGNED' }] }).expect(201)).body.data;
      const holder = await addMember(t, f.orgId, f.owner, 'custom', { roleId: narrow.id });
      const h = as(t, holder);
      expect(code(await h.post(`${b}/roles`, { name: 'Wider', rank: 10, grants: [{ code: 'member.read', scope: 'ORG' }] }))).toBe('PRIVILEGE_ESCALATION');
      expect((await h.post(`${b}/roles`, { name: 'Same or narrower', rank: 10, grants: [{ code: 'member.read', scope: 'ASSIGNED' }] })).status).toBe(201);
      expect(code(await h.post(`${b}/roles`, { name: 'Peer', rank: 65, grants: [] }))).toBe('PRIVILEGE_ESCALATION');
      expect(code(await h.post(`${b}/roles`, { name: 'Boss', rank: 90, grants: [] }))).toBe('PRIVILEGE_ESCALATION');
    });

    it('cannot hand out a low-ranked role that carries permissions you lack', async () => {
      const powerful = (await as(t, F.owner).post(`${base}/roles`, { name: 'Low rank, big powers', rank: 20, grants: [{ code: 'audit.read', scope: 'ORG' }] }).expect(201)).body.data;
      const target = await addMember(t, F.orgId, F.owner, 'participant');
      const res = await as(t, roleAdmin).post(`${base}/members/${target.membershipId}/role`, { roleId: powerful.id });
      expect(code(res)).toBe('PRIVILEGE_ESCALATION');
      expect(res.body.error.details.permissions).toEqual(['audit.read']);
      const inv = await as(t, roleAdmin).post(`${base}/invitations`, { email: uniqueEmail(), roleId: powerful.id });
      expect(code(inv)).toBe('PRIVILEGE_ESCALATION');
      // the owner can
      await as(t, F.owner).post(`${base}/members/${target.membershipId}/role`, { roleId: powerful.id }).expect(200);
    });

    it('platform permissions, unknown permissions, illegal scopes and duplicates are rejected', async () => {
      const o = as(t, F.owner);
      const create = (grants: object[]) => o.post(`${base}/roles`, { name: 'Bad', rank: 10, grants });
      expect(code(await create([{ code: 'platform.stats.read', scope: 'ORG' }]))).toBe('ROLE_INVALID');
      expect(code(await create([{ code: 'platform.role.manage', scope: 'ORG' }]))).toBe('ROLE_INVALID');
      expect(code(await create([{ code: 'made.up', scope: 'ORG' }]))).toBe('ROLE_INVALID');
      expect(code(await create([{ code: 'org.settings.update', scope: 'OWN' }]))).toBe('ROLE_INVALID'); // scope not allowed for this permission
      expect(code(await create([{ code: 'member.read', scope: 'ORG' }, { code: 'member.read', scope: 'OWN' }]))).toBe('ROLE_INVALID');
      expect((await create([{ code: 'member.read', scope: 'ALL' }])).status).toBe(400); // ALL is a platform-only scope
      expect(code(await o.post(`${base}/roles`, { name: 'Empty', rank: 10 }))).toBe('ROLE_INVALID');
    });

    it('system roles are immutable; roles in use cannot be deleted; edits take effect immediately', async () => {
      const o = as(t, F.owner);
      expect(code(await o.patch(`${base}/roles/${roleId.manager}`, { name: 'Hacked' }))).toBe('ROLE_IMMUTABLE');
      expect(code(await o.del(`${base}/roles/${roleId.participant}`))).toBe('ROLE_IMMUTABLE');

      const role = (await o.post(`${base}/roles`, { name: 'Readers', rank: 15, grants: [{ code: 'role.read', scope: 'ORG' }] }).expect(201)).body.data;
      const user = await addMember(t, F.orgId, F.owner, 'custom', { roleId: role.id });
      await as(t, user).get(`${base}/roles`).expect(200);
      expect(code(await o.del(`${base}/roles/${role.id}`))).toBe('ROLE_IN_USE');

      await o.patch(`${base}/roles/${role.id}`, { grants: [{ code: 'member.read', scope: 'OWN' }] }).expect(200);
      expect(code(await as(t, user).get(`${base}/roles`))).toBe('FORBIDDEN'); // revoked on the very next request

      // moving the member away is not enough: membership and invitation history still reference the role
      await o.post(`${base}/members/${user.membershipId}/role`, { roleId: roleId.participant }).expect(200);
      expect(code(await o.del(`${base}/roles/${role.id}`))).toBe('ROLE_IN_USE');

      const unused = (await o.post(`${base}/roles`, { name: 'Never used', rank: 12, grants: [{ code: 'member.read', scope: 'OWN' }] }).expect(201)).body.data;
      await o.del(`${base}/roles/${unused.id}`).expect(204);
      expect((await o.get(`${base}/roles`).expect(200)).body.data.some((r: { id: string }) => r.id === unused.id)).toBe(false);
    });

    it('role changes are written to the audit log with before and after', async () => {
      const log = await t.prisma.auditLog.findFirst({ where: { organizationId: F.orgId, action: 'role.updated' }, orderBy: { id: 'desc' } });
      expect((log?.metadata as { before: unknown[]; after: unknown[] }).before).toEqual([{ code: 'role.read', scope: 'ORG' }]);
      expect((log?.metadata as { after: unknown[] }).after).toEqual([{ code: 'member.read', scope: 'OWN' }]);
    });
  });

  it('an organization owner cannot reach the platform API', async () => {
    for (const path of ['/api/v1/admin/stats', '/api/v1/admin/users', '/api/v1/admin/organizations', '/api/v1/admin/platform-roles']) {
      const res = await as(t, F.owner).get(path);
      expect(res.status, path).toBe(404);
    }
    expect((await t.http().get('/api/v1/admin/stats')).status).toBe(401);
  });
});
