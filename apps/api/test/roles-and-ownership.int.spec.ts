import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, makeSuperAdmin, signUpAndLogin, uniqueEmail, systemRoleId, type OrgFixture, type Session, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

/** Phase 7a: owner, trainer and client only; the owner can coach; custom roles are switched off by configuration. */
describe('owner as trainer', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Coaching Owner Gym');
    base = `/api/v1/orgs/${F.orgId}`;
  });
  afterAll(async () => t.app.close());

  it('an owner can be assigned clients and then coaches them like a trainer', async () => {
    const owner = as(t, F.owner);
    // participant2 has no trainer yet: the owner takes them on
    const contactsOf = async (who: OrgFixture['owner']) => (await as(t, who).get(`${base}/messaging/contacts`).expect(200)).body.data.map((c: { membershipId: string }) => c.membershipId);
    expect(await contactsOf(F.participant2)).toEqual([]);
    expect(code(await as(t, F.participant2).post(`${base}/messaging/conversations`, { membershipId: F.owner.membershipId }))).toBe('CONTACT_NOT_ALLOWED');

    await owner.post(`${base}/assignments`, { practitionerMembershipId: F.owner.membershipId, participantMembershipId: F.participant2.membershipId }).expect(201);

    expect(await contactsOf(F.participant2)).toEqual([F.owner.membershipId]);
    const conv = await as(t, F.participant2).post(`${base}/messaging/conversations`, { membershipId: F.owner.membershipId }).expect(201);
    await as(t, F.participant2).post(`${base}/messaging/conversations/${conv.body.data.id}/messages`, { body: 'Coach, ready for week one.' }).expect(201);
    expect((await owner.get(`${base}/messaging/conversations`).expect(200)).body.data.map((c: { id: string }) => c.id)).toContain(conv.body.data.id);

    // a client assigned to a different trainer still cannot reach the owner
    expect(code(await as(t, F.participant).post(`${base}/messaging/conversations`, { membershipId: F.owner.membershipId }))).toBe('CONTACT_NOT_ALLOWED');
  });
});

describe('custom roles follow the custom_roles feature flag', () => {
  let t: TestApp;
  let admin: Session;
  let F: OrgFixture;
  let G: OrgFixture;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpAndLogin(t);
    await makeSuperAdmin(t, admin);
    F = await buildOrg(t, 'Roles Flag Gym');
    G = await buildOrg(t, 'Roles Flag Gym 2');
  });
  afterAll(async () => t.app.close());

  it('an organization override switches custom roles off for that organization only, and clearing it restores them', async () => {
    const base = `/api/v1/orgs/${F.orgId}`;
    const gbase = `/api/v1/orgs/${G.orgId}`;
    const made = await as(t, F.owner).post(`${base}/roles`, { name: 'Front desk', rank: 30, grants: [{ code: 'member.read', scope: 'ORG' }] }).expect(201);
    const customId = made.body.data.id as string;
    expect((await as(t, F.owner).get(`${base}/context`).expect(200)).body.data.features.custom_roles).toBe(true);

    await as(t, admin).put(`/api/v1/admin/organizations/${F.orgId}/flags/custom_roles`, { enabled: false }).expect(200);
    const owner = as(t, F.owner);
    expect((await owner.get(`${base}/context`).expect(200)).body.data.features.custom_roles).toBe(false);
    for (const res of [
      await owner.post(`${base}/roles`, { name: 'Another', rank: 30, grants: [] }),
      await owner.patch(`${base}/roles/${customId}`, { name: 'Renamed' }),
      await owner.del(`${base}/roles/${customId}`),
    ]) {
      expect(res.status).toBe(403);
      expect(code(res)).toBe('FEATURE_DISABLED');
    }
    // an existing custom role is neither offered nor assignable
    expect((await owner.get(`${base}/assignable-roles`).expect(200)).body.data.map((r: { id: string }) => r.id)).not.toContain(customId);
    const invite = await owner.post(`${base}/invitations`, { email: uniqueEmail(), roleId: customId });
    expect(code(invite)).toBe('ROLE_INVALID');
    expect(invite.body.error.details).toMatchObject({ reason: 'custom_roles_disabled' });
    expect((await owner.post(`${base}/invitations`, { email: uniqueEmail(), roleId: await systemRoleId(t, 'participant') })).status).toBe(201); // system roles untouched

    // the other organization is unaffected
    expect((await as(t, G.owner).get(`${gbase}/context`).expect(200)).body.data.features.custom_roles).toBe(true);
    await as(t, G.owner).post(`${gbase}/roles`, { name: 'Front desk', rank: 30, grants: [] }).expect(201);

    await as(t, admin).put(`/api/v1/admin/organizations/${F.orgId}/flags/custom_roles`, { enabled: null }).expect(200);
    await owner.patch(`${base}/roles/${customId}`, { name: 'Renamed' }).expect(200);
  });
});
