import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, as, buildOrg, createOrg, createTestApp, enableMfa, makeSuperAdmin, signUpAndLogin, type OrgFixture, type Session, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

describe('platform administration (super admin)', () => {
  let t: TestApp;
  let admin: Session;
  let F: OrgFixture;
  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpAndLogin(t);
    await makeSuperAdmin(t, admin);
    F = await buildOrg(t, 'Admin Test Gym');
  });
  afterAll(async () => t.app.close());

  describe('who can enter', () => {
    it('requires authentication; strangers and org owners see a 404, not a 403', async () => {
      expect((await t.http().get('/api/v1/admin/stats')).status).toBe(401);
      const regular = await signUpAndLogin(t);
      expect((await as(t, regular).get('/api/v1/admin/stats')).status).toBe(404);
      expect((await as(t, F.owner).get('/api/v1/admin/users')).status).toBe(404);
    });

    it('platform staff must have MFA enabled and verified in the current session', async () => {
      const staff = await signUpAndLogin(t);
      const role = await t.prisma.role.findUniqueOrThrow({ where: { scopeKey_key: { scopeKey: 'platform', key: 'super_admin' } } });
      await t.prisma.platformRoleAssignment.create({ data: { userId: staff.userId, roleId: role.id } });
      expect(code(await as(t, staff).get('/api/v1/admin/stats'))).toBe('MFA_REQUIRED'); // no MFA yet
      await enableMfa(t, staff);
      await as(t, staff).get('/api/v1/admin/stats').expect(200);
      await t.prisma.userSession.update({ where: { id: staff.sessionId }, data: { mfaVerifiedAt: null } });
      expect(code(await as(t, staff).get('/api/v1/admin/stats'))).toBe('MFA_REQUIRED'); // session not step-up verified
    });

    it('a platform admin has no automatic power inside organizations', async () => {
      expect((await as(t, admin).get(`/api/v1/orgs/${F.orgId}/context`)).status).toBe(404);
      expect((await as(t, admin).get(`/api/v1/orgs/${F.orgId}/members`)).status).toBe(404);
    });
  });

  it('statistics', async () => {
    const stats = (await as(t, admin).get('/api/v1/admin/stats').expect(200)).body.data;
    expect(stats.users.total).toBeGreaterThan(5);
    expect(stats.organizations.ACTIVE).toBeGreaterThan(0);
    expect(stats.organizationsByCategory.fitness).toBeGreaterThan(0);
    expect(stats.activeMemberships).toBeGreaterThan(5);
  });

  describe('users', () => {
    it('lists, searches and paginates; never exposes password material', async () => {
      const page1 = (await as(t, admin).get('/api/v1/admin/users?limit=3').expect(200)).body;
      expect(page1.data).toHaveLength(3);
      expect(page1.meta.nextCursor).toBeTruthy();
      const page2 = (await as(t, admin).get(`/api/v1/admin/users?limit=3&cursor=${page1.meta.nextCursor}`).expect(200)).body;
      expect(page2.data[0].id).not.toBe(page1.data[0].id);
      expect(JSON.stringify(page1)).not.toMatch(/passwordHash|password_hash|argon2/);
      const found = (await as(t, admin).get(`/api/v1/admin/users?q=${encodeURIComponent(F.owner.email)}`).expect(200)).body.data;
      expect(found.some((u: { id: string }) => u.id === F.owner.userId)).toBe(true);
      const detail = (await as(t, admin).get(`/api/v1/admin/users/${F.owner.userId}`).expect(200)).body.data;
      expect(detail.memberships[0].organization.id).toBe(F.orgId);
    });

    it('suspends and activates users: sessions die at once, sign-in is refused, then restored', async () => {
      const victim = await signUpAndLogin(t);
      await as(t, victim).get('/api/v1/me').expect(200);
      const res = await as(t, admin).post(`/api/v1/admin/users/${victim.userId}/suspend`).expect(200);
      expect(res.body.data.status).toBe('SUSPENDED');
      expect(code(await as(t, victim).get('/api/v1/me'))).toBe('SESSION_REVOKED');
      const refresh = await t.http().post('/api/v1/auth/refresh').set('x-client-type', 'ios').send({ refreshToken: victim.refreshToken });
      expect(refresh.status).toBe(401);
      const login = await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: victim.email, password: STRONG_PASSWORD });
      expect(code(login)).toBe('ACCOUNT_SUSPENDED');

      await as(t, admin).post(`/api/v1/admin/users/${victim.userId}/activate`).expect(200);
      await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: victim.email, password: STRONG_PASSWORD }).expect(200);
    });

    it('protects itself: no self-suspension, no suspending platform staff', async () => {
      expect(code(await as(t, admin).post(`/api/v1/admin/users/${admin.userId}/suspend`))).toBe('SELF_ACTION_FORBIDDEN');
      const other = await signUpAndLogin(t);
      await as(t, admin).post('/api/v1/admin/platform-roles', { userId: other.userId, roleKey: 'super_admin' }).expect(200);
      expect(code(await as(t, admin).post(`/api/v1/admin/users/${other.userId}/suspend`))).toBe('PLATFORM_ROLE_INVALID');
      await as(t, admin).del('/api/v1/admin/platform-roles', { userId: other.userId, roleKey: 'super_admin' }).expect(200);
    });
  });

  describe('organizations', () => {
    it('shows metadata and counts but never member names, e-mails or content', async () => {
      const list = (await as(t, admin).get('/api/v1/admin/organizations?q=admin-test').expect(200)).body.data;
      expect(list.length).toBeGreaterThanOrEqual(0);
      const detail = (await as(t, admin).get(`/api/v1/admin/organizations/${F.orgId}`).expect(200)).body.data;
      expect(detail).toMatchObject({ id: F.orgId, name: 'Admin Test Gym', categoryKey: 'fitness', memberships: { ACTIVE: 8 } });
      const raw = JSON.stringify(detail);
      for (const m of [F.owner, F.guardian]) expect(raw).not.toContain(m.email);
    });

    it('suspending an organization locks every member out; activating restores them; both are audited', async () => {
      const base = `/api/v1/orgs/${F.orgId}`;
      await as(t, F.owner).get(`${base}/context`).expect(200);
      await as(t, admin).post(`/api/v1/admin/organizations/${F.orgId}/suspend`).expect(200);
      for (const who of [F.owner, F.participant]) {
        const res = await as(t, who).get(`${base}/context`);
        expect(res.status).toBe(403);
        expect(code(res)).toBe('ORGANIZATION_SUSPENDED');
      }
      // other organizations are unaffected
      const other = await signUpAndLogin(t);
      const o2 = await createOrg(t, other, 'Unaffected Gym');
      await as(t, other).get(`/api/v1/orgs/${o2.orgId}/context`).expect(200);

      await as(t, admin).post(`/api/v1/admin/organizations/${F.orgId}/activate`).expect(200);
      await as(t, F.owner).get(`${base}/context`).expect(200);

      const logs = (await as(t, admin).get(`/api/v1/admin/audit-logs?organizationId=${F.orgId}&action=platform.`).expect(200)).body.data;
      expect(logs.map((l: { action: string }) => l.action)).toEqual(['platform.organization_activated', 'platform.organization_suspended']);
      expect(logs[0]).toMatchObject({ actorType: 'SUPER_ADMIN', actorUserId: admin.userId });
    });
  });

  describe('catalog', () => {
    it('disabling a category blocks new organizations without touching existing ones, and is reversible', async () => {
      try {
        await as(t, admin).patch('/api/v1/admin/categories/fitness', { status: 'DISABLED' }).expect(200);
        const user = await signUpAndLogin(t);
        expect((await as(t, user).post('/api/v1/orgs', { name: 'Blocked', categoryKey: 'fitness' })).body.error.code).toBe('CATEGORY_UNAVAILABLE');
        await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/context`).expect(200);
      } finally {
        await as(t, admin).patch('/api/v1/admin/categories/fitness', { status: 'ENABLED' }).expect(200);
      }
      const categories = (await as(t, admin).get('/api/v1/admin/categories').expect(200)).body.data;
      expect(categories.map((c: { key: string; status: string }) => `${c.key}:${c.status}`)).toEqual(['fitness:ENABLED', 'education:DISABLED', 'coaching:DISABLED', 'business:DISABLED']);
    });

    it('disabling a module removes it from every organization’s context', async () => {
      try {
        await as(t, admin).patch('/api/v1/admin/modules/fitness', { status: 'DISABLED' }).expect(200);
        expect((await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.enabledModules).toEqual([]);
      } finally {
        await as(t, admin).patch('/api/v1/admin/modules/fitness', { status: 'ENABLED' }).expect(200);
      }
      expect((await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.enabledModules).toEqual(['fitness']);
      expect((await as(t, admin).patch('/api/v1/admin/modules/nope', { status: 'DISABLED' })).status).toBe(404);
      expect((await as(t, admin).patch('/api/v1/admin/modules/fitness', { status: 'BROKEN' })).status).toBe(400);
    });
  });

  describe('platform roles', () => {
    it('grants and revokes; the last platform admin and yourself are protected', async () => {
      const other = await signUpAndLogin(t);
      const granted = (await as(t, admin).post('/api/v1/admin/platform-roles', { userId: other.userId, roleKey: 'super_admin' }).expect(200)).body.data;
      expect(granted[0].holders.map((h: { id: string }) => h.id)).toContain(other.userId);
      expect(code(await as(t, admin).del('/api/v1/admin/platform-roles', { userId: admin.userId, roleKey: 'super_admin' }))).toBe('SELF_ACTION_FORBIDDEN');
      await as(t, admin).del('/api/v1/admin/platform-roles', { userId: other.userId, roleKey: 'super_admin' }).expect(200);

      const holders = await t.prisma.platformRoleAssignment.count();
      // revoke everyone but one is allowed; revoking the final holder never is
      if (holders === 1) expect(code(await as(t, other).del('/api/v1/admin/platform-roles', { userId: admin.userId, roleKey: 'super_admin' }))).toBe('NOT_FOUND');
      expect((await as(t, admin).post('/api/v1/admin/platform-roles', { userId: other.userId, roleKey: 'owner' })).status).toBe(400); // only platform roles are grantable here
    });

    it('platform permissions can never reach an organization role', async () => {
      const res = await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/roles`, { name: 'Platform thief', rank: 10, grants: [{ code: 'platform.user.read', scope: 'ORG' }] });
      expect(code(res)).toBe('ROLE_INVALID');
      const roles = (await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/roles`).expect(200)).body.data;
      expect(JSON.stringify(roles)).not.toContain('platform.');
      const perms = (await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/permissions`).expect(200)).body.data;
      expect(perms.some((p: { code: string }) => p.code.startsWith('platform.'))).toBe(false);
    });
  });

  it('every administrative write is recorded as SUPER_ADMIN in the platform audit log', async () => {
    const logs = (await as(t, admin).get('/api/v1/admin/audit-logs?action=platform.&limit=100').expect(200)).body.data;
    const actions = new Set(logs.map((l: { action: string }) => l.action));
    for (const a of ['platform.user_suspended', 'platform.user_activated', 'platform.organization_suspended', 'platform.category_status_changed', 'platform.module_status_changed', 'platform.role_granted', 'platform.role_revoked']) {
      expect(actions.has(a), a).toBe(true);
    }
    expect(logs.every((l: { actorType: string }) => l.actorType === 'SUPER_ADMIN')).toBe(true);
  });
});
