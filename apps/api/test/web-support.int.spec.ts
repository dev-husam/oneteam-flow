import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, makeSuperAdmin, signUpAndLogin, type OrgFixture, type TestApp } from './helpers/app.js';

/** Endpoints the web dashboard relies on. */
describe('web dashboard support endpoints', () => {
  let t: TestApp;
  let F: OrgFixture;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Web Support Gym');
  });
  afterAll(async () => t.app.close());

  it('platform-access tells clients whether to show the admin entry point', async () => {
    const regular = await signUpAndLogin(t);
    expect((await as(t, regular).get('/api/v1/me/platform-access').expect(200)).body.data).toEqual({ isPlatformStaff: false, roles: [] });
    const staff = await signUpAndLogin(t);
    await makeSuperAdmin(t, staff);
    expect((await as(t, staff).get('/api/v1/me/platform-access').expect(200)).body.data).toEqual({ isPlatformStaff: true, roles: ['super_admin'] });
    expect((await t.http().get('/api/v1/me/platform-access')).status).toBe(401);
  });

  it('lists only enabled categories, with names in both languages', async () => {
    const user = await signUpAndLogin(t);
    const res = await as(t, user).get('/api/v1/catalog/categories').expect(200);
    expect(res.body.data).toEqual([{ key: 'fitness', name: { en: 'Fitness', ar: 'اللياقة البدنية' } }]);
    expect((await t.http().get('/api/v1/catalog/categories')).status).toBe(401);
  });

  it('assignable-roles returns exactly what the caller could hand out, even without role.read', async () => {
    const keys = async (who: keyof OrgFixture) =>
      (await as(t, F[who] as OrgFixture['owner']).get(`/api/v1/orgs/${F.orgId}/assignable-roles`).expect(200)).body.data.map((r: { key: string }) => r.key).sort();
    // admin and manager are retired: nobody is offered them any more, and the fixtures that still hold them hand out the same as before minus those.
    expect(await keys('owner')).toEqual(['guardian', 'owner', 'participant', 'practitioner']);
    expect(await keys('admin')).toEqual(['guardian', 'participant', 'practitioner']);
    expect(await keys('manager')).toEqual(['guardian', 'participant', 'practitioner']);
    expect(await keys('practitioner')).toEqual(['guardian', 'participant']); // trainers cannot read /roles yet can still invite clients
    expect(await keys('participant')).toEqual([]);
    expect((await as(t, F.practitioner).get(`/api/v1/orgs/${F.orgId}/roles`)).status).toBe(403);
    const sample = (await as(t, F.practitioner).get(`/api/v1/orgs/${F.orgId}/assignable-roles`).expect(200)).body.data.find((r: { key: string }) => r.key === 'participant');
    expect(sample).toMatchObject({ isSystem: true, labelKey: 'role.participant.client' });
  });

  it('audit entries carry the actor’s display name', async () => {
    const logs = (await as(t, F.owner).get(`/api/v1/orgs/${F.orgId}/audit-logs?action=invitation.created&limit=1`).expect(200)).body.data;
    expect(logs[0].actorName).toBe('Test User');
    expect(logs[0].actorUserId).toBe(F.owner.userId);
  });

  it('admin health reports dependencies and queue depth to platform staff only', async () => {
    const staff = await signUpAndLogin(t);
    await makeSuperAdmin(t, staff);
    const health = (await as(t, staff).get('/api/v1/admin/health').expect(200)).body.data;
    expect(health).toMatchObject({ status: 'ok', checks: { mysql: 'up', redis: 'up' } });
    expect(health.queues.email).toEqual(expect.objectContaining({ waiting: expect.any(Number), failed: expect.any(Number) }));
    expect(health.process.rssMb).toBeGreaterThan(0);
    expect((await as(t, F.owner).get('/api/v1/admin/health')).status).toBe(404);
    const audit = (await as(t, staff).get('/api/v1/admin/audit-logs?action=auth.mfa_enabled&limit=1').expect(200)).body.data;
    expect(audit[0].actorName).toBe('Test User');
  });
});
