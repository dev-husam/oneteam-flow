import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryPushOutbox } from '../src/capabilities/notifications/push.service.js';
import { memoryOutbox } from '../src/infra/mail/mail.service.js';
import { RemindersService } from '../src/modules/fitness/reminders/reminders.service.js';
import { as, buildOrg, createTestApp, makeSuperAdmin, mailTo, PNG, signUpAndLogin, STRONG_PASSWORD, systemRoleId, uniqueEmail, waitForMail, type OrgFixture, type Session, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

/** Phase 7b: the administrator's control center. Every test restores what it changed (the database is shared). */
describe('admin control center', () => {
  let t: TestApp;
  let admin: Session;
  let F: OrgFixture;
  let G: OrgFixture;
  const adminApi = () => as(t, admin);

  beforeAll(async () => {
    t = await createTestApp();
    admin = await signUpAndLogin(t);
    await makeSuperAdmin(t, admin);
    F = await buildOrg(t, 'Config Gym');
    G = await buildOrg(t, 'Config Gym Two');
  });
  afterAll(async () => {
    await t.prisma.platformSetting.deleteMany();
    await t.prisma.platformAsset.deleteMany();
    await t.prisma.emailTemplate.deleteMany();
    await t.prisma.organizationFeatureOverride.deleteMany();
    await t.prisma.featureFlag.updateMany({ where: { key: { not: 'custom_roles' } }, data: { enabled: true } });
    await t.app.close();
  });

  describe('who can use it', () => {
    it('only a platform administrator with MFA; everyone else sees a 404', async () => {
      const paths = ['/flags', '/settings', '/email-templates', `/organizations/${F.orgId}/flags`];
      for (const p of paths) {
        expect((await t.http().get(`/api/v1/admin${p}`)).status).toBe(401);
        expect((await as(t, F.owner).get(`/api/v1/admin${p}`)).status).toBe(404);
        expect((await adminApi().get(`/api/v1/admin${p}`)).status, p).toBe(200);
      }
      expect((await as(t, F.owner).put('/api/v1/admin/flags/messaging', { enabled: false })).status).toBe(404);
    });
  });

  describe('feature flags', () => {
    it('lists the registry with platform values and override counts', async () => {
      const flags = (await adminApi().get('/api/v1/admin/flags').expect(200)).body.data;
      expect(flags.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(['registration', 'organization_creation', 'messaging', 'custom_roles', 'progress_photos', 'reminders', 'push_notifications', 'email_notifications']));
      expect(flags.find((f: { key: string }) => f.key === 'messaging')).toMatchObject({ scope: 'ORGANIZATION', enabled: true, defaultEnabled: true });
      expect((await adminApi().put('/api/v1/admin/flags/nope', { enabled: true })).status).toBe(404);
      expect((await adminApi().put('/api/v1/admin/flags/messaging', { enabled: 'yes' })).status).toBe(400);
    });

    it('switching messaging off platform-wide closes it everywhere: routes, menu and context; switching it on reopens', async () => {
      const base = `/api/v1/orgs/${F.orgId}`;
      const nav = async () => (await as(t, F.owner).get(`${base}/context`).expect(200)).body.data;
      expect((await nav()).navigation.map((n: { key: string }) => n.key)).toContain('messages');

      await adminApi().put('/api/v1/admin/flags/messaging', { enabled: false }).expect(200);
      try {
        const ctx = await nav();
        expect(ctx.features.messaging).toBe(false);
        expect(ctx.navigation.map((n: { key: string }) => n.key)).not.toContain('messages');
        expect(ctx.navigation.map((n: { key: string }) => n.key)).not.toContain('message-reports');
        for (const who of [F.owner, F.practitioner, F.participant]) {
          const res = await as(t, who).get(`${base}/messaging/conversations`);
          expect(res.status).toBe(403);
          expect(code(res)).toBe('FEATURE_DISABLED');
        }
        // a non-member still learns nothing: membership is checked before the flag
        expect((await as(t, G.owner).get(`${base}/messaging/conversations`)).status).toBe(404);
      } finally {
        await adminApi().put('/api/v1/admin/flags/messaging', { enabled: true }).expect(200);
      }
      await as(t, F.practitioner).get(`${base}/messaging/conversations`).expect(200);
    });

    it('a per-organization override beats the platform value in both directions, and platform-only flags have none', async () => {
      const f = `/api/v1/orgs/${F.orgId}`;
      const g = `/api/v1/orgs/${G.orgId}`;
      // off for F only
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/messaging`, { enabled: false }).expect(200);
      expect(code(await as(t, F.owner).get(`${f}/messaging/conversations`))).toBe('FEATURE_DISABLED');
      await as(t, G.owner).get(`${g}/messaging/conversations`).expect(200);
      const detail = (await adminApi().get(`/api/v1/admin/organizations/${F.orgId}/flags`).expect(200)).body.data.find((x: { key: string }) => x.key === 'messaging');
      expect(detail).toMatchObject({ platformEnabled: true, override: false, effective: false });
      expect((await adminApi().get('/api/v1/admin/flags').expect(200)).body.data.find((x: { key: string }) => x.key === 'messaging').overrideCount).toBeGreaterThanOrEqual(1);

      // platform off, on for G only (a beta)
      await adminApi().put('/api/v1/admin/flags/messaging', { enabled: false }).expect(200);
      await adminApi().put(`/api/v1/admin/organizations/${G.orgId}/flags/messaging`, { enabled: true }).expect(200);
      try {
        await as(t, G.owner).get(`${g}/messaging/conversations`).expect(200);
        expect(code(await as(t, F.owner).get(`${f}/messaging/conversations`))).toBe('FEATURE_DISABLED');
      } finally {
        await adminApi().put('/api/v1/admin/flags/messaging', { enabled: true }).expect(200);
        await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/messaging`, { enabled: null }).expect(200);
        await adminApi().put(`/api/v1/admin/organizations/${G.orgId}/flags/messaging`, { enabled: null }).expect(200);
      }
      await as(t, F.owner).get(`${f}/messaging/conversations`).expect(200);

      expect((await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/registration`, { enabled: false })).status).toBe(404);
      expect((await adminApi().put(`/api/v1/admin/organizations/${crypto.randomUUID()}/flags/messaging`, { enabled: false })).status).toBe(404);
    });

    it('progress photos off closes upload, listing and the existing photos', async () => {
      const base = `/api/v1/orgs/${F.orgId}/fitness`;
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/progress_photos`, { enabled: false }).expect(200);
      try {
        expect(code(await as(t, F.participant).post(`${base}/photos`, {}))).toBe('FEATURE_DISABLED');
        expect(code(await as(t, F.owner).get(`${base}/clients/${F.participant.membershipId}/photos`))).toBe('FEATURE_DISABLED');
      } finally {
        await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/progress_photos`, { enabled: null }).expect(200);
      }
      expect((await as(t, F.owner).get(`${base}/clients/${F.participant.membershipId}/photos`)).status).toBe(200);
    });

    it('sign-up and organization creation can be closed; invited people can still register', async () => {
      const register = (email: string) => t.http().post('/api/v1/auth/register').send({ fullName: 'New Person', email, password: STRONG_PASSWORD, acceptTerms: true });
      const outsider = await signUpAndLogin(t);
      await adminApi().put('/api/v1/admin/flags/registration', { enabled: false }).expect(200);
      await adminApi().put('/api/v1/admin/flags/organization_creation', { enabled: false }).expect(200);
      try {
        const closed = await register(uniqueEmail('closed'));
        expect(closed.status).toBe(403);
        expect(code(closed)).toBe('FEATURE_DISABLED');
        const pub = (await t.http().get('/api/v1/config/public').expect(200)).body.data;
        expect(pub.features).toEqual({ registration: false, organization_creation: false });

        const invited = uniqueEmail('invited');
        await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/invitations`, { email: invited, roleId: await systemRoleId(t, 'participant') }).expect(201);
        expect((await register(invited)).status).toBe(202); // an invitation to this address opens sign-up for it

        expect(code(await as(t, outsider).post('/api/v1/orgs', { name: 'Closed Gym', categoryKey: 'fitness' }))).toBe('FEATURE_DISABLED');
      } finally {
        await adminApi().put('/api/v1/admin/flags/registration', { enabled: true }).expect(200);
        await adminApi().put('/api/v1/admin/flags/organization_creation', { enabled: true }).expect(200);
      }
      expect((await register(uniqueEmail('open'))).status).toBe(202);
      await as(t, outsider).post('/api/v1/orgs', { name: 'Open Gym', categoryKey: 'fitness' }).expect(201);
    });

    it('notification channels and reminders follow their flags per organization', async () => {
      const wait = async (cond: () => boolean, ms = 6000) => {
        const end = Date.now() + ms;
        while (!cond()) {
          if (Date.now() > end) throw new Error('condition not met');
          await new Promise((r) => setTimeout(r, 50));
        }
      };
      const tasks = `/api/v1/orgs/${F.orgId}/tasks`;
      const assign = (title: string) => as(t, F.practitioner).post(tasks, { title, assigneeMembershipIds: [F.participant.membershipId] }).expect(201);
      const person = as(t, F.participant);
      await person.post('/api/v1/me/devices', { expoPushToken: 'ExponentPushToken[flagtestdevicexxxxxx]', platform: 'IOS', locale: 'en' }).expect(204);
      await person.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'EMAIL', enabled: true }).expect(204);

      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/push_notifications`, { enabled: false }).expect(200);
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/email_notifications`, { enabled: false }).expect(200);
      const inboxBefore = (await person.get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count;
      await assign('Channels off');
      // the in-app notification still arrives: only push and e-mail are closed
      expect((await person.get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count).toBe(inboxBefore + 1);

      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/push_notifications`, { enabled: null }).expect(200);
      await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/email_notifications`, { enabled: null }).expect(200);
      await assign('Channels on');
      await wait(() => memoryOutbox.some((m) => m.to === F.participant.email && m.text.includes('Channels on')) && memoryPushOutbox.some((m) => m.body.includes('Channels on')));
      // jobs are processed in order, so anything sent for the first task would be here by now
      expect(memoryOutbox.some((m) => m.text.includes('Channels off'))).toBe(false);
      expect(memoryPushOutbox.some((m) => m.body.includes('Channels off'))).toBe(false);

      // reminders: an organization with the flag off is skipped entirely
      const reminders = t.app.get(RemindersService);
      const internals = reminders as unknown as { forOrganization: (org: { id: string }, now: Date) => Promise<{ due: number; overdue: number; trainerNotices: number }> };
      const forOrg = vi.spyOn(internals, 'forOrganization').mockResolvedValue({ due: 0, overdue: 0, trainerNotices: 0 });
      try {
        await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/reminders`, { enabled: false }).expect(200);
        await reminders.run(new Date());
        expect(forOrg.mock.calls.some((c) => c[0].id === F.orgId)).toBe(false);
        await adminApi().put(`/api/v1/admin/organizations/${F.orgId}/flags/reminders`, { enabled: null }).expect(200);
        await reminders.run(new Date());
        expect(forOrg.mock.calls.some((c) => c[0].id === F.orgId)).toBe(true);
      } finally {
        forOrg.mockRestore();
      }
    });

    it('every change is written to the platform audit log with before and after', async () => {
      const logs = (await adminApi().get('/api/v1/admin/audit-logs?action=platform.flag_changed&limit=5').expect(200)).body.data;
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toMatchObject({ action: 'platform.flag_changed', actorType: 'SUPER_ADMIN' });
      expect(logs[0].metadata).toMatchObject({ key: expect.any(String), from: expect.any(Boolean), to: expect.any(Boolean) });
      const overrides = (await adminApi().get(`/api/v1/admin/audit-logs?action=platform.flag_override_changed&limit=5`).expect(200)).body.data;
      expect(overrides.length).toBeGreaterThan(0);
    });
  });

  describe('identity, mail branding and logo', () => {
    it('starts with defaults, validates, merges partial updates and publishes to everyone through /config/public', async () => {
      const first = (await adminApi().get('/api/v1/admin/settings').expect(200)).body.data;
      expect(first.identity.appName).toEqual({ en: 'Personal Trainer', ar: 'المدرب الشخصي' });
      expect(first.theme).toBeUndefined(); // colours and corners now live in designs (design.int.spec.ts)
      expect(first.logo).toBeNull();

      const bad = await adminApi().put('/api/v1/admin/settings/identity', { appName: { en: '' }, supportEmail: 'nope' });
      expect(bad.status).toBe(400);
      expect(code(bad)).toBe('SETTINGS_INVALID');
      expect(bad.body.error.details.fields).toMatchObject({ 'appName.en': 'required', supportEmail: 'email' });

      await adminApi().put('/api/v1/admin/settings/identity', { appName: { en: 'Atlas Coaching' }, supportEmail: 'Help@Atlas.test' }).expect(200);
      await adminApi().put('/api/v1/admin/settings/mail', { fromName: 'Atlas Team', footer: { en: 'Atlas Coaching, Riyadh' } }).expect(200);

      const pub = await t.http().get('/api/v1/config/public').expect(200); // no sign-in needed
      expect(pub.headers['cache-control']).toContain('max-age');
      expect(pub.body.data.identity).toMatchObject({ appName: { en: 'Atlas Coaching', ar: 'المدرب الشخصي' }, supportEmail: 'help@atlas.test' });
      expect(pub.body.data.design).toMatchObject({ key: 'oneteam-flow', radius: 'default' });
      expect(JSON.stringify(pub.body.data)).not.toMatch(/fromName|footer/); // mail branding is not public
    });

    it('accepts a small PNG logo, serves it publicly with caching, and rejects everything else', async () => {
      const upload = (mimeType: string, bytes: Buffer) => adminApi().put('/api/v1/admin/settings/logo', { mimeType, data: bytes.toString('base64') });
      expect(code(await upload('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBe('LOGO_INVALID');
      expect(code(await upload('image/png', Buffer.from('not really a png')))).toBe('LOGO_INVALID'); // claimed type must match the bytes
      expect(code(await upload('image/png', Buffer.concat([PNG, Buffer.alloc(70 * 1024)])))).toBe('LOGO_INVALID'); // over 64 KB
      expect((await t.http().get('/api/v1/config/logo')).status).toBe(404);

      const ok = await upload('image/png', PNG).expect(200);
      expect(ok.body.data).toMatchObject({ mimeType: 'image/png', sizeBytes: PNG.length });
      const pub = (await t.http().get('/api/v1/config/public').expect(200)).body.data;
      expect(pub.logoUrl).toMatch(/^\/config\/logo\?v=[0-9a-f]{12}$/);

      const served = await t.http().get('/api/v1/config/logo').expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['content-security-policy']).toContain('sandbox');
      expect(Buffer.compare(served.body, PNG)).toBe(0);
      expect((await t.http().get('/api/v1/config/logo').set('If-None-Match', served.headers.etag as string)).status).toBe(304);

      await adminApi().del('/api/v1/admin/settings/logo').expect(204);
      expect((await t.http().get('/api/v1/config/logo')).status).toBe(404);
      expect((await t.http().get('/api/v1/config/public').expect(200)).body.data.logoUrl).toBeNull();
    });
  });

  describe('e-mail templates', () => {
    it('lists every template in both languages and shows the default, the placeholders and the custom text', async () => {
      const list = (await adminApi().get('/api/v1/admin/email-templates').expect(200)).body.data;
      expect(list).toHaveLength(12);
      expect(list.every((x: { customized: boolean }) => x.customized === false)).toBe(true);
      const one = (await adminApi().get('/api/v1/admin/email-templates/invitation/en').expect(200)).body.data;
      expect(one).toMatchObject({ key: 'invitation', locale: 'en', hasButton: true, custom: null });
      expect(one.placeholders).toEqual(expect.arrayContaining(['name', 'orgName', 'inviterName', 'link']));
      expect(one.default.subject).toContain('{{orgName}}');
      expect((await adminApi().get('/api/v1/admin/email-templates/nope/en')).status).toBe(404);
      expect((await adminApi().get('/api/v1/admin/email-templates/invitation/fr')).status).toBe(404);
    });

    it('rejects unknown placeholders, a bare link in the text, a missing button label and over-long text', async () => {
      const put = (body: object) => adminApi().put('/api/v1/admin/email-templates/invitation/en', body);
      const good = { subject: 'Join {{orgName}}', body: 'Hi {{name}}', action: 'Join' };
      expect((await put({ ...good, subject: '{{password}}' })).body.error.details.fields).toEqual({ subject: 'placeholder' });
      expect((await put({ ...good, body: 'Go to {{link}}' })).body.error.details.fields).toEqual({ body: 'link_in_text' });
      expect((await put({ ...good, action: '' })).body.error.details.fields).toEqual({ action: 'required' });
      expect((await put({ ...good, body: 'x'.repeat(3001) })).body.error.details.fields).toEqual({ body: 'too_long' });
      expect(code(await adminApi().put('/api/v1/admin/email-templates/password-changed/en', good))).toBe('TEMPLATE_INVALID'); // this template has no button, and {{orgName}} is not available to it
    });

    it('a saved template is what people receive, with branding and escaping; resetting restores the default', async () => {
      await adminApi().put('/api/v1/admin/settings/mail', { fromName: 'Atlas Team', footer: { en: 'Atlas Coaching, Riyadh' } }).expect(200);
      await adminApi().put('/api/v1/admin/email-templates/invitation/en', {
        subject: 'Your seat at {{orgName}} is ready',
        body: 'Welcome to {{appName}}, {{name}}.\n\n{{inviterName}} added you to {{orgName}}.',
        action: 'Accept my seat',
      }).expect(200);
      expect((await adminApi().get('/api/v1/admin/email-templates').expect(200)).body.data.find((x: { key: string; locale: string }) => x.key === 'invitation' && x.locale === 'en').customized).toBe(true);

      const email = uniqueEmail('seat');
      await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/invitations`, { email, roleId: await systemRoleId(t, 'participant') }).expect(201);
      const mail = await waitForMail(mailTo(email, 'seat at'));
      expect(mail.subject).toBe('Your seat at Config Gym is ready');
      expect(mail.text).toContain('Welcome to Atlas Coaching'); // the app name set in the identity test above
      expect(mail.text).toContain('Accept my seat:');
      expect(mail.text).toContain('Atlas Coaching, Riyadh');
      expect(mail.html).toContain('Atlas Coaching, Riyadh');
      expect(mail.fromName).toBe('Atlas Team');

      // administrator-supplied text is never trusted as markup, and values are escaped
      await adminApi().put('/api/v1/admin/email-templates/invitation/en', { subject: 'Hi', body: '<script>alert(1)</script> {{inviterName}}', action: 'Open' }).expect(200);
      const e2 = uniqueEmail('esc');
      await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/invitations`, { email: e2, roleId: await systemRoleId(t, 'participant') }).expect(201);
      const mail2 = await waitForMail((m) => m.to === e2);
      expect(mail2.html).not.toContain('<script>');
      expect(mail2.html).toContain('&lt;script&gt;');

      await adminApi().del('/api/v1/admin/email-templates/invitation/en').expect(200);
      const e3 = uniqueEmail('def');
      await as(t, F.owner).post(`/api/v1/orgs/${F.orgId}/invitations`, { email: e3, roleId: await systemRoleId(t, 'participant') }).expect(201);
      expect((await waitForMail(mailTo(e3, 'invited you'))).subject).toBe('Config Gym invited you to join');
    });

    it('preview renders an unsaved draft; test send mails the administrator themselves', async () => {
      const draft = { subject: 'Preview for {{name}}', body: 'Hello {{name}} from {{appName}}', action: 'Go' };
      const prev = (await adminApi().post('/api/v1/admin/email-templates/verify-email/en/preview', draft).expect(200)).body.data;
      expect(prev.subject).toBe('Preview for Sara');
      expect(prev.html).toContain('Hello Sara from');
      expect(code(await adminApi().post('/api/v1/admin/email-templates/verify-email/en/preview', { ...draft, subject: '{{nope}}' }))).toBe('TEMPLATE_INVALID');

      const sent = (await adminApi().post('/api/v1/admin/email-templates/verify-email/en/test', draft).expect(200)).body.data;
      expect(sent.sentTo).toBe(admin.email);
      expect(memoryOutbox.some((m) => m.to === admin.email && m.subject === '[Test] Preview for Sara')).toBe(true);
      expect((await as(t, F.owner).post('/api/v1/admin/email-templates/verify-email/en/test', draft)).status).toBe(404);
      // nothing was saved by previewing or testing
      expect((await adminApi().get('/api/v1/admin/email-templates/verify-email/en').expect(200)).body.data.custom).toBeNull();
    });

    it('account e-mails keep working with a template saved in Arabic and rendered right-to-left', async () => {
      await adminApi().put('/api/v1/admin/email-templates/verify-email/ar', { subject: 'أهلاً بك في {{appName}}', body: 'مرحبًا {{name}}، أكّد بريدك.', action: 'تأكيد' }).expect(200);
      const email = uniqueEmail('arabic');
      await t.http().post('/api/v1/auth/register').send({ fullName: 'سارة', email, password: STRONG_PASSWORD, acceptTerms: true, locale: 'ar' }).expect(202);
      const mail = await waitForMail((m) => m.to === email);
      expect(mail.subject).toMatch(/^أهلاً بك في /);
      expect(mail.html).toContain('dir="rtl"');
      await adminApi().del('/api/v1/admin/email-templates/verify-email/ar').expect(200);
    });
  });
});
