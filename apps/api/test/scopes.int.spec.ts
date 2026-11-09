import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, systemRoleId, type OrgFixture, type TestApp } from './helpers/app.js';

/** Resource-level access: OWN / ASSIGNED / ORG scopes resolved inside the queries (IDOR protection). */
describe('permission scopes', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t);
    base = `/api/v1/orgs/${F.orgId}`;
  });
  afterAll(async () => t.app.close());

  const memberIds = async (who: keyof OrgFixture) => {
    const res = await as(t, F[who] as OrgFixture['owner']).get(`${base}/members?limit=100`).expect(200);
    return res.body.data.map((m: { id: string }) => m.id).sort();
  };

  it('ORG scope sees everyone; the list is complete', async () => {
    for (const who of ['owner', 'admin', 'manager'] as const) expect(await memberIds(who)).toHaveLength(8);
  });

  it('ASSIGNED scope: a practitioner sees themself and only their own participants', async () => {
    expect(await memberIds('practitioner')).toEqual([F.practitioner.membershipId, F.participant.membershipId].sort());
    expect(await memberIds('practitioner2')).toEqual([F.practitioner2.membershipId]);
  });

  it('OWN scope: guardians see only themselves; clients do not get the member list at all', async () => {
    expect(await memberIds('guardian')).toEqual([F.guardian.membershipId]);
    const res = await as(t, F.participant).get(`${base}/members?limit=100`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('single-member reads follow the same scope: invisible members are 404, not 403', async () => {
    const p1 = as(t, F.practitioner);
    await p1.get(`${base}/members/${F.participant.membershipId}`).expect(200);
    await p1.get(`${base}/members/${F.practitioner.membershipId}`).expect(200);
    for (const hidden of [F.participant2.membershipId, F.practitioner2.membershipId, F.owner.membershipId]) {
      const res = await p1.get(`${base}/members/${hidden}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    // a client cannot read any member record, not even their own: their data comes from /me and their plans
    expect((await as(t, F.participant).get(`${base}/members/${F.practitioner.membershipId}`)).status).toBe(403);
    expect((await as(t, F.participant).get(`${base}/members/${F.participant.membershipId}`)).status).toBe(403);
    // a guardian still reads their own record and nobody else's
    await as(t, F.guardian).get(`${base}/members/${F.guardian.membershipId}`).expect(200);
    expect((await as(t, F.guardian).get(`${base}/members/${F.practitioner.membershipId}`)).status).toBe(404);
  });

  it('search cannot be used to see around the scope', async () => {
    const res = await as(t, F.guardian).get(`${base}/members?q=${encodeURIComponent('Test User')}&limit=100`).expect(200);
    expect(res.body.data.map((m: { id: string }) => m.id)).toEqual([F.guardian.membershipId]);
  });

  it('assignment changes move the practitioner’s reach immediately', async () => {
    const owner = as(t, F.owner);
    const created = await owner.post(`${base}/assignments`, { practitionerMembershipId: F.practitioner2.membershipId, participantMembershipId: F.participant2.membershipId }).expect(201);
    expect(await memberIds('practitioner2')).toEqual([F.practitioner2.membershipId, F.participant2.membershipId].sort());
    await as(t, F.practitioner2).get(`${base}/members/${F.participant2.membershipId}`).expect(200);

    await owner.post(`${base}/assignments/${created.body.data.id}/end`).expect(200);
    expect(await memberIds('practitioner2')).toEqual([F.practitioner2.membershipId]);
    expect((await as(t, F.practitioner2).get(`${base}/members/${F.participant2.membershipId}`)).status).toBe(404);
  });

  it('a removed participant disappears from the practitioner’s reach and their assignment ends', async () => {
    const extra = await (await import('./helpers/app.js')).addMember(t, F.orgId, F.owner, 'participant', { assignToMembershipId: F.practitioner2.membershipId });
    expect(await memberIds('practitioner2')).toContain(extra.membershipId);
    await as(t, F.owner).del(`${base}/members/${extra.membershipId}`).expect(204);
    expect(await memberIds('practitioner2')).not.toContain(extra.membershipId);
    const ended = await t.prisma.memberAssignment.findFirst({ where: { participantMembershipId: extra.membershipId } });
    expect(ended?.endedAt).not.toBeNull();
    expect(ended?.activeKey).toBeNull();
  });

  it('OWN scope on groups and invitations: practitioners see only what they created', async () => {
    const p1 = as(t, F.practitioner);
    const p2 = as(t, F.practitioner2);
    const g1 = (await p1.post(`${base}/groups`, { name: 'P1 group' }).expect(201)).body.data.id;
    const g2 = (await p2.post(`${base}/groups`, { name: 'P2 group' }).expect(201)).body.data.id;

    const p1Groups = (await p1.get(`${base}/groups`).expect(200)).body.data.map((g: { id: string }) => g.id);
    expect(p1Groups).toContain(g1);
    expect(p1Groups).not.toContain(g2);
    expect((await p1.get(`${base}/groups/${g2}`)).status).toBe(404);
    expect((await p1.patch(`${base}/groups/${g2}`, { name: 'hijack' })).status).toBe(404);
    expect((await p1.del(`${base}/groups/${g2}`)).status).toBe(404);
    // managers see and manage all groups
    const managerGroups = (await as(t, F.manager).get(`${base}/groups`).expect(200)).body.data.map((g: { id: string }) => g.id);
    expect(managerGroups).toEqual(expect.arrayContaining([g1, g2]));
    await as(t, F.manager).patch(`${base}/groups/${g2}`, { name: 'Renamed by manager' }).expect(200);

    // a practitioner can only add people they may see
    await p1.post(`${base}/groups/${g1}/members`, { membershipId: F.participant.membershipId }).expect(200);
    expect((await p1.post(`${base}/groups/${g1}/members`, { membershipId: F.participant2.membershipId })).body.error.code).toBe('GROUP_MEMBER_INVALID');

    const participantRole = await systemRoleId(t, 'participant');
    const inv = (await p1.post(`${base}/invitations`, { email: 'scope.test@example.test', roleId: participantRole }).expect(201)).body.data.id;
    const p1Inv = (await p1.get(`${base}/invitations`).expect(200)).body.data.map((i: { id: string }) => i.id);
    expect(p1Inv).toContain(inv);
    expect((await p2.get(`${base}/invitations`).expect(200)).body.data.map((i: { id: string }) => i.id)).not.toContain(inv);
    expect((await p2.post(`${base}/invitations/${inv}/resend`)).status).toBe(404);
    expect((await p2.del(`${base}/invitations/${inv}`)).status).toBe(404);
    await p1.del(`${base}/invitations/${inv}`).expect(204);
  });

  it('OWN scope on assignments: a participant sees only assignments they are part of', async () => {
    const seen = (await as(t, F.participant).get(`${base}/assignments`).expect(200)).body.data;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((a: { participantMembershipId: string; practitionerMembershipId: string }) => a.participantMembershipId === F.participant.membershipId || a.practitionerMembershipId === F.participant.membershipId)).toBe(true);
    const all = (await as(t, F.owner).get(`${base}/assignments`).expect(200)).body.data;
    expect(all.length).toBeGreaterThan(seen.length - 1);
  });
});
