import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryPushOutbox } from '../src/capabilities/notifications/push.service.js';
import { memoryOutbox } from '../src/infra/mail/mail.service.js';
import { as, buildOrg, createTestApp, type OrgFixture, type TestApp } from './helpers/app.js';

const token = (n: string) => `ExponentPushToken[${n.padEnd(22, 'x')}]`;
const wait = async (cond: () => boolean, ms = 6000) => {
  const started = Date.now();
  while (!cond()) {
    if (Date.now() - started > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('notifications', () => {
  let t: TestApp;
  let F: OrgFixture;
  let tasks: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Notify Gym');
    tasks = `/api/v1/orgs/${F.orgId}/tasks`;
  });
  afterAll(async () => t.app.close());

  const assign = (title: string) => as(t, F.practitioner).post(tasks, { title, assigneeMembershipIds: [F.participant.membershipId] }).expect(201);

  it('delivers an in-app notification, rendered in the recipient’s language, with deep-link data', async () => {
    const created = await assign('Drink water');
    const en = (await as(t, F.participant).get('/api/v1/me/notifications').expect(200)).body.data;
    expect(en[0]).toMatchObject({ typeKey: 'task.assigned', title: 'New task', body: 'Test User assigned you "Drink water".', readAt: null });
    expect(en[0].data).toMatchObject({ taskId: created.body.data.id });
    expect(en[0].data.orgSlug).toBeTruthy();

    await as(t, F.participant).patch('/api/v1/me', { locale: 'ar' }).expect(200);
    const ar = (await as(t, F.participant).get('/api/v1/me/notifications').expect(200)).body.data;
    expect(ar[0].title).toBe('مهمة جديدة');
    expect(ar[0].body).toContain('Drink water');
    await as(t, F.participant).patch('/api/v1/me', { locale: 'en' }).expect(200);
  });

  it('does not notify the person who did the action', async () => {
    const before = await t.prisma.notification.count({ where: { userId: F.practitioner.userId } });
    await as(t, F.practitioner).post(tasks, { title: 'Self task' }).expect(201);
    expect(await t.prisma.notification.count({ where: { userId: F.practitioner.userId } })).toBe(before);
  });

  it('unread count, mark one read, mark all read; only the recipient can touch a notification', async () => {
    await assign('Stretch A');
    await assign('Stretch B');
    const p = as(t, F.participant);
    const count = (await p.get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count;
    expect(count).toBeGreaterThanOrEqual(2);
    const first = (await p.get('/api/v1/me/notifications?unread=true&limit=1').expect(200)).body;
    expect(first.data).toHaveLength(1);
    expect(first.meta.nextCursor).toBeTruthy();

    expect((await as(t, F.practitioner).post(`/api/v1/me/notifications/${first.data[0].id}/read`)).status).toBe(404); // not theirs
    await p.post(`/api/v1/me/notifications/${first.data[0].id}/read`).expect(204);
    expect((await p.get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count).toBe(count - 1);
    await p.post('/api/v1/me/notifications/read-all').expect(204);
    expect((await p.get('/api/v1/me/notifications/unread-count').expect(200)).body.data.count).toBe(0);
    expect((await p.get('/api/v1/me/notifications?unread=true').expect(200)).body.data).toEqual([]);
  });

  it('pushes to every active device in the device’s language, and not to revoked ones', async () => {
    const p = as(t, F.participant);
    await p.post('/api/v1/me/devices', { expoPushToken: token('arabicphone'), platform: 'IOS', locale: 'ar' }).expect(204);
    await p.post('/api/v1/me/devices', { expoPushToken: token('englishphone'), platform: 'ANDROID', locale: 'en' }).expect(204);
    await p.post('/api/v1/me/devices', { expoPushToken: token('oldphone'), platform: 'ANDROID', locale: 'en' }).expect(204);
    await p.del('/api/v1/me/devices', { expoPushToken: token('oldphone') }).expect(204);

    await assign('Push me');
    await wait(() => memoryPushOutbox.filter((m) => m.body.includes('Push me')).length >= 2);
    const sent = memoryPushOutbox.filter((m) => m.body.includes('Push me'));
    expect(sent.map((m) => m.to).sort()).toEqual([token('arabicphone'), token('englishphone')].sort());
    expect(sent.find((m) => m.to === token('arabicphone'))!.title).toBe('مهمة جديدة');
    expect(sent.find((m) => m.to === token('englishphone'))!.title).toBe('New task');
    expect(sent[0]!.data).toMatchObject({ taskId: expect.any(String) });
  });

  describe('preferences', () => {
    it('lists effective settings with sensible defaults', async () => {
      const prefs = (await as(t, F.participant2).get('/api/v1/me/notification-preferences').expect(200)).body.data;
      expect(prefs.find((c: { category: string }) => c.category === 'tasks').channels).toEqual({ IN_APP: true, PUSH: true, EMAIL: false });
    });

    it('turning the inbox off stops in-app notifications for that category', async () => {
      const u = as(t, F.participant2);
      await u.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'IN_APP', enabled: false }).expect(204);
      const before = await t.prisma.notification.count({ where: { userId: F.participant2.userId } });
      await as(t, F.manager).post(tasks, { title: 'Quiet one', assigneeMembershipIds: [F.participant2.membershipId] }).expect(201);
      expect(await t.prisma.notification.count({ where: { userId: F.participant2.userId } })).toBe(before);
      await u.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'IN_APP', enabled: true }).expect(204);
    });

    it('e-mail is opt-in, localized, and links back into the organization', async () => {
      const u = as(t, F.participant2);
      await u.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'EMAIL', enabled: true }).expect(204);
      await as(t, F.manager).post(tasks, { title: 'Email me', assigneeMembershipIds: [F.participant2.membershipId] }).expect(201);
      await wait(() => memoryOutbox.some((m) => m.to === F.participant2.email && m.subject === 'New task'));
      const mail = memoryOutbox.find((m) => m.to === F.participant2.email && m.subject === 'New task')!;
      expect(mail.text).toContain('Email me');
      expect(mail.text).toMatch(/\/en\/o\/[^/\s]+\/tasks\/[0-9a-f-]{36}/);
    });

    it('an organization-level setting overrides the personal default', async () => {
      const u = as(t, F.participant2);
      await u.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'EMAIL', enabled: true }).expect(204);
      await u.put('/api/v1/me/notification-preferences', { organizationId: F.orgId, category: 'tasks', channel: 'EMAIL', enabled: false }).expect(204);
      const inOrg = (await u.get(`/api/v1/me/notification-preferences?organizationId=${F.orgId}`).expect(200)).body.data[0];
      expect(inOrg.channels.EMAIL).toBe(false);
      const global = (await u.get('/api/v1/me/notification-preferences').expect(200)).body.data[0];
      expect(global.channels.EMAIL).toBe(true);
    });

    it('validates input and refuses organizations the user does not belong to', async () => {
      const u = as(t, F.participant2);
      expect((await u.put('/api/v1/me/notification-preferences', { category: 'nope', channel: 'EMAIL', enabled: true })).status).toBe(400);
      expect((await u.put('/api/v1/me/notification-preferences', { category: 'tasks', channel: 'SMS', enabled: true })).status).toBe(400);
      const other = await buildOrg(t, 'Other Gym');
      expect((await u.put('/api/v1/me/notification-preferences', { organizationId: other.orgId, category: 'tasks', channel: 'EMAIL', enabled: true })).status).toBe(404);
    });
  });
});
