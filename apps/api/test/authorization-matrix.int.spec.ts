import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, systemRoleId, uniqueEmail, type OrgFixture, type TestApp } from './helpers/app.js';

type RoleName = 'owner' | 'admin' | 'manager' | 'practitioner' | 'guardian' | 'participant';
const ROLES: RoleName[] = ['owner', 'admin', 'manager', 'practitioner', 'guardian', 'participant'];

/** Which roles hold the permission guarding the route. Everyone else must get 403 FORBIDDEN. */
const ALL_STAFF: RoleName[] = ['owner', 'admin', 'manager', 'practitioner'];
const MATRIX: { name: string; method: 'get' | 'post' | 'patch' | 'del'; path: string; body?: (f: OrgFixture, roleId: string) => object; allowed: RoleName[] }[] = [
  { name: 'org settings update', method: 'patch', path: '', body: () => ({ name: 'Renamed' }), allowed: ['owner', 'admin'] },
  { name: 'organization read', method: 'get', path: '', allowed: ROLES },
  { name: 'context', method: 'get', path: '/context', allowed: ROLES },
  // Clients (participants) do not see the member list; guardians still see themselves.
  { name: 'member list', method: 'get', path: '/members', allowed: ROLES.filter((r) => r !== 'participant') },
  { name: 'role list', method: 'get', path: '/roles', allowed: ['owner', 'admin', 'manager'] },
  { name: 'permission catalog', method: 'get', path: '/permissions', allowed: ['owner', 'admin', 'manager'] },
  { name: 'role create', method: 'post', path: '/roles', body: () => ({ name: 'Probe', rank: 5, grants: [] }), allowed: ['owner', 'admin'] },
  { name: 'invite', method: 'post', path: '/invitations', body: (_f, roleId) => ({ email: uniqueEmail('probe'), roleId }), allowed: ALL_STAFF },
  { name: 'invitation list', method: 'get', path: '/invitations', allowed: ALL_STAFF },
  { name: 'group list', method: 'get', path: '/groups', allowed: ALL_STAFF },
  { name: 'group create', method: 'post', path: '/groups', body: () => ({ name: 'Probe group' }), allowed: ALL_STAFF },
  { name: 'assignment list', method: 'get', path: '/assignments', allowed: ['owner', 'admin', 'manager', 'practitioner', 'participant'] },
  { name: 'assignment create', method: 'post', path: '/assignments', body: () => ({ practitionerMembershipId: randomUUID(), participantMembershipId: randomUUID() }), allowed: ['owner', 'admin', 'manager'] },
  { name: 'audit log', method: 'get', path: '/audit-logs', allowed: ['owner', 'admin'] },
  { name: 'member role change', method: 'post', path: `/members/${randomUUID()}/role`, body: (_f, roleId) => ({ roleId }), allowed: ['owner', 'admin'] },
  { name: 'member suspend', method: 'post', path: `/members/${randomUUID()}/suspend`, allowed: ['owner', 'admin'] },
  { name: 'member remove', method: 'del', path: `/members/${randomUUID()}`, allowed: ['owner', 'admin'] },
  { name: 'invitation revoke', method: 'del', path: `/invitations/${randomUUID()}`, allowed: ALL_STAFF },
];

describe('authorization: role × endpoint matrix generated from the permission catalog', () => {
  let t: TestApp;
  let F: OrgFixture;
  let participantRoleId: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t);
    participantRoleId = await systemRoleId(t, 'participant');
  });
  afterAll(async () => t.app.close());

  for (const entry of MATRIX) {
    it(`${entry.name}: allowed for ${entry.allowed.join(', ')} only`, async () => {
      const actual: Record<string, string> = {};
      for (const role of ROLES) {
        const api = as(t, F[role]);
        const path = `/api/v1/orgs/${F.orgId}${entry.path}`;
        const body = entry.body?.(F, participantRoleId);
        const res = await (entry.method === 'get' ? api.get(path) : entry.method === 'del' ? api.del(path) : entry.method === 'patch' ? api.patch(path, body) : api.post(path, body));
        // FORBIDDEN is the permission guard's answer; anything else means the guard let the caller through.
        actual[role] = res.status === 403 && res.body.error?.code === 'FORBIDDEN' ? 'deny' : 'allow';
      }
      const expected = Object.fromEntries(ROLES.map((r) => [r, entry.allowed.includes(r) ? 'allow' : 'deny']));
      expect(actual).toEqual(expected);
    });
  }

  it('suspended and removed members lose access immediately', async () => {
    const owner = as(t, F.owner);
    const base = `/api/v1/orgs/${F.orgId}`;
    await as(t, F.guardian).get(`${base}/context`).expect(200);
    await owner.post(`${base}/members/${F.guardian.membershipId}/suspend`).expect(200);
    expect((await as(t, F.guardian).get(`${base}/context`)).status).toBe(404); // not an active member: the organization disappears
    await owner.post(`${base}/members/${F.guardian.membershipId}/reactivate`).expect(200);
    await as(t, F.guardian).get(`${base}/context`).expect(200);
    await owner.del(`${base}/members/${F.guardian.membershipId}`).expect(204);
    expect((await as(t, F.guardian).get(`${base}/context`)).status).toBe(404);
  });

  it('an unverified account cannot use organization routes even with a membership', async () => {
    const f = await buildOrg(t, 'Unverified Test');
    await t.prisma.user.update({ where: { id: f.manager.userId }, data: { emailVerifiedAt: null } });
    const res = await as(t, f.manager).get(`/api/v1/orgs/${f.orgId}/context`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
