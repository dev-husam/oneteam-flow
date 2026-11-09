import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createOrg, createTestApp, signUpAndLogin, type OrgFixture, type TestApp } from './helpers/app.js';

describe('organizations', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  it('creating an organization makes the caller its owner with the category’s default modules', async () => {
    const user = await signUpAndLogin(t);
    const res = await as(t, user).post('/api/v1/orgs', { name: 'Atlas Fitness', categoryKey: 'fitness', timezone: 'Asia/Riyadh', defaultLocale: 'ar' });
    expect(res.status).toBe(201);
    expect(res.body.data.organization).toMatchObject({ name: 'Atlas Fitness', slug: 'atlas-fitness', categoryKey: 'fitness', timezone: 'Asia/Riyadh', defaultLocale: 'ar', status: 'ACTIVE' });

    const orgId = res.body.data.organization.id;
    const ctx = (await as(t, user).get(`/api/v1/orgs/${orgId}/context`).expect(200)).body.data;
    expect(ctx.membership.role).toMatchObject({ key: 'owner', rank: 100, labelKey: 'role.owner.default' });
    expect(ctx.enabledModules).toEqual(['fitness']);
    expect(ctx.permissions.find((p: { code: string }) => p.code === 'org.settings.update')).toEqual({ code: 'org.settings.update', scope: 'ORG' });
    expect(ctx.permissions.some((p: { code: string }) => p.code.startsWith('platform.'))).toBe(false);
    expect(ctx.navigation.map((n: { key: string }) => n.key)).toEqual(['overview', 'members', 'invitations', 'tasks', 'messages', 'message-reports', 'progress', 'clients', 'checkins', 'plans', 'nutrition-plans', 'exercises', 'workouts', 'nutrition', 'checkin', 'groups', 'roles', 'audit', 'settings']);

    const audit = await t.prisma.auditLog.findFirst({ where: { organizationId: orgId, action: 'organization.created' } });
    expect(audit).toMatchObject({ actorUserId: user.userId, actorType: 'USER', targetId: orgId });
    const mine = (await as(t, user).get('/api/v1/me/organizations').expect(200)).body.data;
    expect(mine).toEqual([expect.objectContaining({ membershipId: res.body.data.membershipId, role: expect.objectContaining({ key: 'owner' }) })]);
  });

  it('generates unique slugs from the name and validates explicit ones', async () => {
    // One organization per account: every successful creation below uses a fresh user.
    const user = await signUpAndLogin(t);
    const a = await as(t, await signUpAndLogin(t)).post('/api/v1/orgs', { name: 'Slug Test Gym', categoryKey: 'fitness' }).expect(201);
    const b = await as(t, await signUpAndLogin(t)).post('/api/v1/orgs', { name: 'Slug Test Gym', categoryKey: 'fitness' }).expect(201);
    expect(a.body.data.organization.slug).toMatch(/^slug-test-gym/);
    expect(b.body.data.organization.slug).not.toBe(a.body.data.organization.slug);

    expect((await as(t, user).post('/api/v1/orgs', { name: 'نادي القوة', categoryKey: 'fitness' })).body.error.code).toBe('SLUG_INVALID'); // no Latin letters to derive from
    await as(t, await signUpAndLogin(t)).post('/api/v1/orgs', { name: 'نادي القوة', categoryKey: 'fitness', slug: 'quwa-club' }).expect(201);
    for (const slug of ['admin', 'API', 'a', '-bad-', 'has space']) {
      const res = await as(t, user).post('/api/v1/orgs', { name: 'X Gym', categoryKey: 'fitness', slug });
      expect([400, 422]).toContain(res.status);
    }
    const taken = await as(t, user).post('/api/v1/orgs', { name: 'Other', categoryKey: 'fitness', slug: 'quwa-club' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('SLUG_TAKEN');
  });

  it('rejects unavailable categories, unknown categories and unverified accounts', async () => {
    const user = await signUpAndLogin(t);
    expect((await as(t, user).post('/api/v1/orgs', { name: 'School', categoryKey: 'education' })).body.error.code).toBe('CATEGORY_UNAVAILABLE');
    expect((await as(t, user).post('/api/v1/orgs', { name: 'Nope', categoryKey: 'astrology' })).status).toBe(400);

    await t.prisma.user.update({ where: { id: user.userId }, data: { emailVerifiedAt: null } });
    const res = await as(t, user).post('/api/v1/orgs', { name: 'Unverified', categoryKey: 'fitness' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('an account belongs to one organization: owners, trainers and clients cannot start or join a second', async () => {
    const owner = await signUpAndLogin(t);
    await createOrg(t, owner, 'Only One Gym');
    const second = await as(t, owner).post('/api/v1/orgs', { name: 'Second Gym', categoryKey: 'fitness' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_IN_ORGANIZATION');

    // a client invited into an organization cannot create their own
    const F = await buildOrg(t, 'Rule Gym');
    for (const who of [F.practitioner, F.participant]) {
      const res = await as(t, who).post('/api/v1/orgs', { name: 'Side Business', categoryKey: 'fitness' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_IN_ORGANIZATION');
    }
    expect(await t.prisma.membership.count({ where: { userId: F.participant.userId } })).toBe(1);

    // the database itself refuses a second live membership, whatever code path tries it
    const other = await createOrg(t, await signUpAndLogin(t), 'Elsewhere Gym');
    const role = await t.prisma.role.findFirstOrThrow({ where: { scopeKey: 'system', key: 'participant' } });
    await expect(
      t.prisma.membership.create({ data: { organizationId: other.orgId, userId: F.participant.userId, roleId: role.id, activeUserKey: F.participant.userId } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // leaving frees the account: it may then start its own organization
    await as(t, F.participant).post(`/api/v1/orgs/${F.orgId}/leave`).expect(204);
    await as(t, F.participant).post('/api/v1/orgs', { name: 'After Leaving Gym', categoryKey: 'fitness' }).expect(201);
  });

  it('only whitelisted settings can be changed, and only with org.settings.update', async () => {
    const user = await signUpAndLogin(t);
    const { orgId } = await createOrg(t, user, 'Settings Gym');
    const api = as(t, user);
    const upd = await api.patch(`/api/v1/orgs/${orgId}`, { name: 'Renamed Gym', timezone: 'Europe/Berlin', weekStartsOn: 6, contactEmail: 'hello@settings.test', contactPhone: '+966501234567', description: 'We lift.' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ name: 'Renamed Gym', timezone: 'Europe/Berlin', weekStartsOn: 6, contactEmail: 'hello@settings.test' });

    for (const body of [{ slug: 'new-slug' }, { status: 'ACTIVE' }, { categoryId: 'x' }, { createdByUserId: 'x' }, { id: 'x' }]) {
      expect((await api.patch(`/api/v1/orgs/${orgId}`, body)).status).toBe(400);
    }
    expect((await api.patch(`/api/v1/orgs/${orgId}`, { timezone: 'Mars/Base' })).status).toBe(400);
    expect((await api.patch(`/api/v1/orgs/${orgId}`, { weekStartsOn: 9 })).status).toBe(400);
    const audit = await t.prisma.auditLog.findFirst({ where: { organizationId: orgId, action: 'organization.updated' } });
    expect((audit?.metadata as { fields: string[] }).fields).toContain('timezone');
  });

  describe('context is permission-aware and category-aware', () => {
    let F: OrgFixture;
    beforeAll(async () => (F = await buildOrg(t, 'Context Gym')));

    it('navigation and permissions differ by role', async () => {
      const nav = async (who: 'owner' | 'manager' | 'practitioner' | 'participant') =>
        (await as(t, F[who]).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.navigation.map((n: { key: string }) => n.key);
      expect(await nav('manager')).toEqual(['overview', 'members', 'invitations', 'tasks', 'messages', 'progress', 'clients', 'checkins', 'plans', 'nutrition-plans', 'exercises', 'workouts', 'nutrition', 'checkin', 'groups', 'roles']);
      expect(await nav('practitioner')).toEqual(['overview', 'members', 'invitations', 'tasks', 'messages', 'progress', 'clients', 'checkins', 'plans', 'nutrition-plans', 'exercises', 'workouts', 'nutrition', 'checkin', 'groups']);
      expect(await nav('participant')).toEqual(['overview', 'tasks', 'messages', 'progress', 'exercises', 'workouts', 'nutrition', 'checkin']);
    });

    it('role labels come from the organization’s category, never from the role key', async () => {
      const ctx = (await as(t, F.practitioner).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data;
      expect(ctx.membership.role.key).toBe('practitioner');
      expect(ctx.membership.role.labelKey).toBe('role.practitioner.trainer');
      const members = (await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/members?limit=100`).expect(200)).body.data;
      expect(members.find((m: { id: string }) => m.id === F.participant.membershipId).role.labelKey).toBe('role.participant.client');
    });
  });
});
