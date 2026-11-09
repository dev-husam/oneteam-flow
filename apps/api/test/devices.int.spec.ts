import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createTestApp, signUpAndLogin, STRONG_PASSWORD, type TestApp } from './helpers/app.js';

const token = (n: string) => `ExponentPushToken[${n.padEnd(22, 'x')}]`;

describe('push devices', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  it('registers a device, updates it on re-registration, and revokes it', async () => {
    const s = await signUpAndLogin(t);
    const body = { expoPushToken: token('aaa'), platform: 'IOS', locale: 'ar' };
    await as(t, s).post('/api/v1/me/devices', body).expect(204);
    await as(t, s).post('/api/v1/me/devices', { ...body, locale: 'en' }).expect(204);
    const rows = await t.prisma.pushDevice.findMany({ where: { userId: s.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: 'en', platform: 'IOS', revokedAt: null });
    await as(t, s).del('/api/v1/me/devices', { expoPushToken: body.expoPushToken }).expect(204);
    expect((await t.prisma.pushDevice.findFirstOrThrow({ where: { userId: s.userId } })).revokedAt).not.toBeNull();
  });

  it('a token moves to whoever registers it last, so a previous account stops receiving pushes', async () => {
    const a = await signUpAndLogin(t);
    const b = await signUpAndLogin(t);
    const body = { expoPushToken: token('shared'), platform: 'ANDROID', locale: 'en' };
    await as(t, a).post('/api/v1/me/devices', body).expect(204);
    await as(t, b).post('/api/v1/me/devices', body).expect(204);
    const row = await t.prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: body.expoPushToken } });
    expect(row.userId).toBe(b.userId);
    // the previous owner cannot revoke someone else's registration
    await as(t, a).del('/api/v1/me/devices', { expoPushToken: body.expoPushToken }).expect(204);
    expect((await t.prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: body.expoPushToken } })).revokedAt).toBeNull();
  });

  it('validates input, requires sign-in, and logout-all revokes every device', async () => {
    const s = await signUpAndLogin(t);
    expect((await as(t, s).post('/api/v1/me/devices', { expoPushToken: 'not-a-token', platform: 'IOS', locale: 'en' })).status).toBe(400);
    expect((await as(t, s).post('/api/v1/me/devices', { expoPushToken: token('ok1'), platform: 'WINDOWS', locale: 'en' })).status).toBe(400);
    expect((await t.http().post('/api/v1/me/devices').send({})).status).toBe(401);
    await as(t, s).post('/api/v1/me/devices', { expoPushToken: token('ok2'), platform: 'IOS', locale: 'en' }).expect(204);
    await as(t, s).post('/api/v1/auth/logout-all').expect(204);
    expect((await t.prisma.pushDevice.findFirstOrThrow({ where: { userId: s.userId } })).revokedAt).not.toBeNull();
    void STRONG_PASSWORD;
  });
});
