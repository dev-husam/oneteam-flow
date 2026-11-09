import { BUILT_IN_DESIGNS, DESIGN_TOKEN_KEYS } from '@pt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, buildOrg, createTestApp, makeSuperAdmin, mailTo, signUpAndLogin, systemRoleId, uniqueEmail, waitForMail, type OrgFixture, type Session, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;
const oneteam = BUILT_IN_DESIGNS[0]!;

/** Phase 7c: designs (themes). Everything created here is removed afterwards: the database is shared. */
describe('design system', () => {
  let t: TestApp;
  let admin: Session;
  let F: OrgFixture;
  let G: OrgFixture;
  const adminApi = () => as(t, admin);
  const designs = async () => (await adminApi().get('/api/v1/admin/designs').expect(200)).body.data as { key: string; builtIn: boolean; isDefault: boolean; organizationCount: number; light: Record<string, string> }[];

  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpAndLogin(t);
    await makeSuperAdmin(t, admin);
    F = await buildOrg(t, 'Design Gym');
    G = await buildOrg(t, 'Design Gym Two');
  });
  afterAll(async () => {
    await t.prisma.organizationDesign.deleteMany();
    await t.prisma.platformSetting.deleteMany({ where: { key: 'design' } });
    await t.prisma.designTheme.deleteMany({ where: { builtInKey: null } });
    await t.prisma.user.updateMany({ where: { designKey: { not: null } }, data: { designKey: null } });
    await t.prisma.organizationFeatureOverride.deleteMany();
    await t.prisma.featureFlag.update({ where: { key: 'user_design_choice' }, data: { enabled: true } });
    for (const d of BUILT_IN_DESIGNS) await t.prisma.designTheme.update({ where: { key: d.key }, data: { name: d.name, description: d.description, userSelectable: true, definition: { radius: d.radius, font: d.font, light: d.light, dark: d.dark } } });
    await t.prisma.emailTemplate.deleteMany();
    await t.app.close();
  });

  it('starts with the two built-in designs, OneTeam Flow as the default; only administrators can see or change them', async () => {
    const list = await designs();
    expect(list.map((d) => d.key)).toEqual(expect.arrayContaining(['oneteam-flow', 'classic']));
    expect(list.find((d) => d.key === 'oneteam-flow')).toMatchObject({ builtIn: true, isDefault: true, organizationCount: 0 });
    expect(list.find((d) => d.key === 'classic')).toMatchObject({ builtIn: true, isDefault: false });
    expect(Object.keys(list[0]!.light).sort()).toEqual([...DESIGN_TOKEN_KEYS].sort());
    expect((await t.http().get('/api/v1/admin/designs')).status).toBe(401);
    expect((await as(t, F.owner).get('/api/v1/admin/designs')).status).toBe(404);
    expect((await as(t, F.owner).post('/api/v1/admin/designs', { name: 'Mine' })).status).toBe(404);
  });

  it('everyone gets the default design before signing in, as validated tokens', async () => {
    const pub = (await t.http().get('/api/v1/config/public').expect(200)).body.data;
    expect(pub.design).toMatchObject({ key: 'oneteam-flow', name: 'OneTeam Flow', font: 'jakarta' });
    expect(pub.design.light.actionPrimary).toBe(oneteam.light.actionPrimary);
    expect(pub.design.dark.backgroundApp).toBe('#081326');
  });

  describe('creating and editing', () => {
    let key: string;

    it('creates a design from an existing one, changing only the tokens named', async () => {
      const res = await adminApi().post('/api/v1/admin/designs', { name: 'Sea Breeze', description: 'Teal accent', basedOn: 'oneteam-flow', light: { actionPrimary: '#0F766E', actionPrimaryHover: '#115E59', actionPrimaryText: '#FFFFFF' }, radius: 'round' });
      expect(res.status).toBe(201);
      key = res.body.data.key;
      expect(key).toBe('sea-breeze');
      expect(res.body.data).toMatchObject({ builtIn: false, isDefault: false, radius: 'round', name: 'Sea Breeze' });
      expect(res.body.data.light.actionPrimary).toBe('#0F766E');
      expect(res.body.data.light.textPrimary).toBe(oneteam.light.textPrimary); // untouched
      expect(res.body.data.dark).toEqual(oneteam.dark);
      const twin = await adminApi().post('/api/v1/admin/designs', { name: 'Sea Breeze' });
      expect(twin.body.data.key).toBe('sea-breeze-2'); // names can repeat, keys cannot
      await adminApi().del(`/api/v1/admin/designs/${twin.body.data.key}`).expect(204);
    });

    it('refuses colours that are malformed or hard to read, and says exactly which and by how much', async () => {
      const bad = await adminApi().post('/api/v1/admin/designs', { name: 'Unreadable', light: { actionPrimaryText: '#FFFFFF', surfaceCard: 'white' } });
      expect(bad.status).toBe(400);
      expect(code(bad)).toBe('DESIGN_INVALID');
      expect(bad.body.error.details.issues).toEqual(expect.arrayContaining([expect.objectContaining({ mode: 'light', token: 'surfaceCard', rule: 'hex' })]));
      const contrast = await adminApi().post('/api/v1/admin/designs', { name: 'White on orange', light: { actionPrimaryText: '#FFFFFF' } });
      expect(code(contrast)).toBe('DESIGN_INVALID');
      expect(contrast.body.error.details.issues).toContainEqual(expect.objectContaining({ mode: 'light', token: 'actionPrimaryText', against: 'actionPrimary', rule: 'contrast', min: 4.5 }));
      expect(code(await adminApi().post('/api/v1/admin/designs', { name: '<b>x</b>' }))).toBe('DESIGN_INVALID');
      expect(code(await adminApi().post('/api/v1/admin/designs', { name: 'Odd', radius: 'pill' }))).toBe('DESIGN_INVALID');
      expect((await designs()).some((d) => d.key === 'unreadable' || d.key === 'white-on-orange')).toBe(false); // nothing half-saved
    });

    it('edits a design (merging tokens) and returns accessibility warnings that do not block saving', async () => {
      const res = await adminApi().patch(`/api/v1/admin/designs/${key}`, { description: 'Calmer teal', dark: { chartPrimary: '#0D1A33' } });
      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Calmer teal');
      expect(res.body.data.dark.chartPrimary).toBe('#0D1A33');
      expect(res.body.data.warnings).toContainEqual(expect.objectContaining({ mode: 'dark', token: 'chartPrimary', severity: 'warning' }));
      expect(code(await adminApi().patch(`/api/v1/admin/designs/${key}`, { light: { textPrimary: '#EEEEEE' } }))).toBe('DESIGN_INVALID');
      expect((await adminApi().get(`/api/v1/admin/designs/${key}`).expect(200)).body.data.light.textPrimary).toBe(oneteam.light.textPrimary); // the failed edit changed nothing
      expect((await adminApi().get('/api/v1/admin/designs/nope')).status).toBe(404);
    });

    it('a built-in design can be edited and put back to its original', async () => {
      await adminApi().patch('/api/v1/admin/designs/classic', { name: 'Classic (mine)', light: { actionPrimary: '#1D4ED8', actionPrimaryHover: '#1E40AF', textLink: '#1D4ED8' } }).expect(200);
      expect((await designs()).find((d) => d.key === 'classic')!.light.actionPrimary).toBe('#1D4ED8');
      const reset = await adminApi().post('/api/v1/admin/designs/classic/reset').expect(200);
      expect(reset.body.data).toMatchObject({ name: 'Classic blue' });
      expect(reset.body.data.light.actionPrimary).toBe('#2C59E8');
      expect(code(await adminApi().post(`/api/v1/admin/designs/${key}/reset`))).toBe('VALIDATION_FAILED'); // only built-in designs have an original
    });

    it('the default design reaches everyone; changing it back restores the original', async () => {
      await adminApi().put('/api/v1/admin/design-default', { key }).expect(200);
      try {
        const pub = (await t.http().get('/api/v1/config/public').expect(200)).body.data;
        expect(pub.design).toMatchObject({ key, radius: 'round' });
        expect(pub.design.light.actionPrimary).toBe('#0F766E');
        expect((await designs()).find((d) => d.key === key)!.isDefault).toBe(true);
        // e-mail buttons follow the default design's primary action and its readable text colour
        const email = uniqueEmail('designmail');
        await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/invitations`, { email, roleId: await systemRoleId(t, 'participant') }).expect(201);
        const mail = await waitForMail(mailTo(email, 'invited you'));
        expect(mail.html).toContain('background:#0F766E;color:#FFFFFF');
      } finally {
        await adminApi().put('/api/v1/admin/design-default', { key: 'oneteam-flow' }).expect(200);
      }
      expect((await t.http().get('/api/v1/config/public').expect(200)).body.data.design.key).toBe('oneteam-flow');
      expect(code(await adminApi().put('/api/v1/admin/design-default', { key: 'nope' }))).toBe('NOT_FOUND');
    });

    it('deleting: built-ins and the default are protected, a design in use is protected, an unused custom one goes', async () => {
      expect(code(await adminApi().del('/api/v1/admin/designs/classic'))).toBe('DESIGN_BUILT_IN');
      expect(code(await adminApi().del('/api/v1/admin/designs/oneteam-flow'))).toBe('DESIGN_BUILT_IN');
      await adminApi().put(`/api/v1/admin/organizations/${G.orgId}/design`, { key }).expect(200);
      const used = await adminApi().del(`/api/v1/admin/designs/${key}`);
      expect(code(used)).toBe('DESIGN_IN_USE');
      expect(used.body.error.details).toMatchObject({ organizations: 1 });
      await adminApi().put('/api/v1/admin/design-default', { key }).expect(200);
      await adminApi().put(`/api/v1/admin/organizations/${G.orgId}/design`, { key: null }).expect(200);
      expect(code(await adminApi().del(`/api/v1/admin/designs/${key}`))).toBe('DESIGN_IN_USE'); // still the default
      await adminApi().put('/api/v1/admin/design-default', { key: 'oneteam-flow' }).expect(200);
      await adminApi().del(`/api/v1/admin/designs/${key}`).expect(204);
      expect((await designs()).some((d) => d.key === key)).toBe(false);
    });
  });

  describe('a design for one organization', () => {
    it('an organization can use another design; its members get it in their context, other organizations do not', async () => {
      const ctx = async (o: OrgFixture) => (await as(t, o.owner).get(`/api/v1/orgs/${o.orgId}/context`).expect(200)).body.data.design;
      expect(await ctx(F)).toBeNull(); // follows the platform default
      const res = await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/design`, { key: 'classic' }).expect(200);
      expect(res.body.data).toEqual({ themeKey: 'classic', default: 'oneteam-flow' });
      const mine = await ctx(F);
      expect(mine).toMatchObject({ key: 'classic', name: 'Classic blue', font: 'plex' });
      expect(mine.light.actionPrimary).toBe('#2C59E8');
      expect(await ctx(G)).toBeNull();
      expect((await designs()).find((d) => d.key === 'classic')!.organizationCount).toBe(1);
      for (const who of [F.participant, F.practitioner]) {
        expect((await as(t, who).get(`/api/v1/orgs/${F.orgId}/context`).expect(200)).body.data.design.key).toBe('classic'); // everyone in it
      }
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/design`, { key: null }).expect(200);
      expect(await ctx(F)).toBeNull();
    });

    it('unknown organizations and designs are 404; members cannot choose their own organization’s design', async () => {
      expect((await adminApi().put(`/api/v1/admin/organizations/${crypto.randomUUID()}/design`, { key: 'classic' })).status).toBe(404);
      expect(code(await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/design`, { key: 'nope' }))).toBe('NOT_FOUND');
      expect((await as(t, F.owner).put(`/api/v1/admin/organizations/${F.orgId}/design`, { key: 'classic' })).status).toBe(404);
      expect((await adminApi().get(`/api/v1/admin/organizations/${F.orgId}/design`).expect(200)).body.data).toEqual({ themeKey: null, default: 'oneteam-flow' });
    });
  });

  describe('a personal choice', () => {
    const me = (s: Session) => as(t, s);

    it('people see the designs made available to them and their current choice; custom designs are opt-in', async () => {
      const person = F.participant;
      const opts = (await me(person).get('/api/v1/me/designs').expect(200)).body.data;
      expect(opts).toMatchObject({ enabled: true, selectedKey: null, design: null, platformDefaultKey: 'oneteam-flow' });
      expect(opts.designs.map((d: { key: string }) => d.key).sort()).toEqual(['classic', 'oneteam-flow']);
      expect(opts.designs[0].light.actionPrimary).toMatch(/^#[0-9A-F]{6}$/);
      const custom = (await adminApi().post('/api/v1/admin/designs', { name: 'Personal Teal', light: { actionPrimary: '#0F766E', actionPrimaryHover: '#115E59', actionPrimaryText: '#FFFFFF' } }).expect(201)).body.data;
      expect(custom.userSelectable).toBe(false);
      expect((await me(person).get('/api/v1/me/designs').expect(200)).body.data.designs.map((d: { key: string }) => d.key)).not.toContain(custom.key);
      expect(code(await me(person).put('/api/v1/me/design', { key: custom.key }))).toBe('NOT_FOUND'); // not offered
      expect((await t.http().get('/api/v1/me/designs')).status).toBe(401);
    });

    it('choosing a design is personal: it shows in /me/design for that person only, and can be cleared', async () => {
      const [a, b] = [F.participant, F.practitioner];
      const res = await me(a).put('/api/v1/me/design', { key: 'classic' }).expect(200);
      expect(res.body.data).toMatchObject({ enabled: true, selectedKey: 'classic' });
      expect(res.body.data.design).toMatchObject({ key: 'classic', font: 'plex' });
      expect((await me(a).get('/api/v1/me/design').expect(200)).body.data.selectedKey).toBe('classic');
      expect((await me(b).get('/api/v1/me/design').expect(200)).body.data).toMatchObject({ selectedKey: null, design: null });
      expect(code(await me(a).put('/api/v1/me/design', { key: 'nope' }))).toBe('NOT_FOUND');
      expect((await me(a).put('/api/v1/me/design', { key: '../x' })).status).toBe(400);
      expect((await me(a).put('/api/v1/me/design', { key: null }).expect(200)).body.data).toMatchObject({ selectedKey: null, design: null });
    });

    it('the administrator decides which designs are offered; withdrawing one ignores existing choices instead of failing', async () => {
      const key = (await designs()).find((d) => d.key.startsWith('personal-teal'))!.key;
      await adminApi().patch(`/api/v1/admin/designs/${key}`, { userSelectable: true }).expect(200);
      expect((await adminApi().patch(`/api/v1/admin/designs/${key}`, { userSelectable: 'yes' })).status).toBe(400);
      const person = F.participant;
      expect((await me(person).put('/api/v1/me/design', { key }).expect(200)).body.data.selectedKey).toBe(key);
      const listed = (await adminApi().get('/api/v1/admin/designs').expect(200)).body.data.find((d: { key: string }) => d.key === key);
      expect(listed).toMatchObject({ userSelectable: true, userCount: 1 });

      await adminApi().patch(`/api/v1/admin/designs/${key}`, { userSelectable: false }).expect(200);
      expect((await me(person).get('/api/v1/me/design').expect(200)).body.data).toMatchObject({ selectedKey: null, design: null }); // falls back
      await adminApi().patch(`/api/v1/admin/designs/${key}`, { userSelectable: true }).expect(200);
      expect((await me(person).get('/api/v1/me/design').expect(200)).body.data.selectedKey).toBe(key); // and returns if offered again

      // deleting a design someone chose is allowed: their choice is cleared
      await adminApi().del(`/api/v1/admin/designs/${key}`).expect(204);
      expect((await me(person).get('/api/v1/me/design').expect(200)).body.data.selectedKey).toBeNull();
      expect(await t.prisma.user.count({ where: { designKey: key } })).toBe(0);
    });

    it('can be switched off for everyone (flag), or for one organization, which clients read from the organization context', async () => {
      const person = F.participant;
      await me(person).put('/api/v1/me/design', { key: 'classic' }).expect(200);
      await adminApi().put('/api/v1/admin/flags/user_design_choice', { enabled: false }).expect(200);
      try {
        expect((await me(person).get('/api/v1/me/designs').expect(200)).body.data).toMatchObject({ enabled: false, designs: [], selectedKey: null, design: null });
        expect(code(await me(person).put('/api/v1/me/design', { key: 'oneteam-flow' }))).toBe('FEATURE_DISABLED');
      } finally {
        await adminApi().put('/api/v1/admin/flags/user_design_choice', { enabled: true }).expect(200);
      }
      expect((await me(person).get('/api/v1/me/design').expect(200)).body.data.selectedKey).toBe('classic'); // the choice was kept

      const ctx = async (o: OrgFixture) => (await as(t, o.owner).get(`/api/v1/orgs/${o.orgId}/context`).expect(200)).body.data.features.user_design_choice;
      expect(await ctx(F)).toBe(true);
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/user_design_choice`, { enabled: false }).expect(200);
      expect(await ctx(F)).toBe(false);
      expect(await ctx(G)).toBe(true);
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/user_design_choice`, { enabled: null }).expect(200);
    });
  });

  it('every design change is audited without the colours themselves', async () => {
    const logs = (await adminApi().get('/api/v1/admin/audit-logs?limit=100').expect(200)).body.data as { action: string; metadata: unknown }[];
    const actions = new Set(logs.map((l) => l.action));
    for (const a of ['platform.design_created', 'platform.design_updated', 'platform.design_reset', 'platform.design_default_changed', 'platform.design_organization_changed', 'platform.design_deleted']) expect(actions.has(a), a).toBe(true);
    expect(JSON.stringify(logs.filter((l) => l.action.startsWith('platform.design_')).map((l) => l.metadata))).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
