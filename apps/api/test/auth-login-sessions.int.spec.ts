import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, bearer, createTestApp, signUpAndLogin, uniqueEmail, type TestApp } from './helpers/app.js';

describe('login, access tokens and sessions', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  const login = (email: string, password: string, client: string | null = 'ios') => {
    const req = t.http().post('/api/v1/auth/login');
    if (client) req.set('x-client-type', client);
    return req.send({ email, password });
  };

  it('gives native clients the refresh token in the body and no cookie', async () => {
    const s = await signUpAndLogin(t);
    const res = await login(s.email, STRONG_PASSWORD, 'android');
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.emailVerified).toBe(true);
  });

  it('gives web clients an HttpOnly cookie and no refresh token in the body', async () => {
    const s = await signUpAndLogin(t);
    const res = await login(s.email, STRONG_PASSWORD, 'web');
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/pt_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('requires the x-client-type header', async () => {
    const s = await signUpAndLogin(t);
    const res = await login(s.email, STRONG_PASSWORD, null);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('answers a wrong password and an unknown e-mail identically', async () => {
    const s = await signUpAndLogin(t);
    const wrong = await login(s.email, 'definitely-not-the-password');
    const unknown = await login(uniqueEmail('nobody'), STRONG_PASSWORD);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('locks an address out after 5 failures, even for the right password', async () => {
    const s = await signUpAndLogin(t);
    for (let i = 0; i < 5; i++) await login(s.email, 'wrong-password-' + i);
    const locked = await login(s.email, STRONG_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_LOGIN_ATTEMPTS');
  });

  it('reveals suspension only to someone who knows the password', async () => {
    const s = await signUpAndLogin(t);
    await t.prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
    expect((await login(s.email, 'wrong-password-x')).body.error.code).toBe('INVALID_CREDENTIALS');
    const res = await login(s.email, STRONG_PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  describe('access token guard', () => {
    it('rejects missing, malformed and unsigned tokens', async () => {
      expect((await t.http().get('/api/v1/me')).body.error.code).toBe('UNAUTHENTICATED');
      expect((await t.http().get('/api/v1/me').set('Authorization', 'Bearer abc.def.ghi')).body.error.code).toBe('TOKEN_INVALID');

      const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x","sid":"y"}').toString('base64url')}.`;
      expect((await t.http().get('/api/v1/me').set('Authorization', `Bearer ${none}`)).body.error.code).toBe('TOKEN_INVALID');

      const hs256 = await new SignJWT({ sid: 'y' }).setProtectedHeader({ alg: 'HS256' }).setSubject('x').sign(new TextEncoder().encode('secret-secret-secret-secret-secret!!'));
      expect((await t.http().get('/api/v1/me').set('Authorization', `Bearer ${hs256}`)).body.error.code).toBe('TOKEN_INVALID');
    });

    it('stops working the moment the user is suspended or the session revoked', async () => {
      const s = await signUpAndLogin(t);
      await t.http().get('/api/v1/me').set(bearer(s)).expect(200);
      await t.prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
      const res = await t.http().get('/api/v1/me').set(bearer(s));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('profile', () => {
    it('returns and updates the profile through an allow-listed shape', async () => {
      const s = await signUpAndLogin(t);
      const me = await t.http().get('/api/v1/me').set(bearer(s)).expect(200);
      expect(me.body.data.email).toBe(s.email);
      expect(Object.keys(me.body.data)).not.toContain('passwordHash');

      const upd = await t
        .http()
        .patch('/api/v1/me')
        .set(bearer(s))
        .send({ fullName: 'New Name', locale: 'ar', timezone: 'Asia/Riyadh', unitSystem: 'IMPERIAL', phone: '+966501234567' })
        .expect(200);
      expect(upd.body.data).toMatchObject({ fullName: 'New Name', locale: 'ar', timezone: 'Asia/Riyadh', unitSystem: 'IMPERIAL', phone: '+966501234567', phoneVerified: false });
    });

    it('cannot change protected fields', async () => {
      const s = await signUpAndLogin(t);
      for (const body of [{ status: 'ACTIVE' }, { email: 'x@y.com' }, { passwordHash: 'x' }, { emailVerifiedAt: null }]) {
        const res = await t.http().patch('/api/v1/me').set(bearer(s)).send(body);
        expect(res.status).toBe(400);
      }
    });

    it('rejects invalid phone and timezone, and a phone already used by another account', async () => {
      const a = await signUpAndLogin(t);
      const b = await signUpAndLogin(t);
      const phone = `+9665${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      await t.http().patch('/api/v1/me').set(bearer(a)).send({ phone }).expect(200);
      expect((await t.http().patch('/api/v1/me').set(bearer(a)).send({ phone: '12345' })).status).toBe(400);
      expect((await t.http().patch('/api/v1/me').set(bearer(a)).send({ timezone: 'Mars/Olympus' })).status).toBe(400);
      const clash = await t.http().patch('/api/v1/me').set(bearer(b)).send({ phone });
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe('PHONE_ALREADY_REGISTERED');
      expect((await t.http().patch('/api/v1/me').set(bearer(a)).send({ phone: null }).expect(200)).body.data.phone).toBeNull();
    });
  });

  describe('sessions', () => {
    it('lists own sessions, marks the current one, and revokes another device immediately', async () => {
      const first = await signUpAndLogin(t);
      const second = await login(first.email, STRONG_PASSWORD, 'android').set('x-device-name', 'Pixel 9');
      const secondToken = second.body.data.accessToken as string;

      const list = await t.http().get('/api/v1/me/sessions').set(bearer(first)).expect(200);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(list.body.data.find((s: { deviceName: string | null }) => s.deviceName === 'Pixel 9')).toBeTruthy();

      await t.http().delete(`/api/v1/me/sessions/${second.body.data.sessionId}`).set(bearer(first)).expect(204);
      const dead = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${secondToken}`);
      expect(dead.status).toBe(401);
      expect(dead.body.error.code).toBe('SESSION_REVOKED');
      await t.http().get('/api/v1/me').set(bearer(first)).expect(200);
    });

    it("cannot see or revoke another user's session (IDOR): plain 404", async () => {
      const victim = await signUpAndLogin(t);
      const attacker = await signUpAndLogin(t);
      const res = await t.http().delete(`/api/v1/me/sessions/${victim.sessionId}`).set(bearer(attacker));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
      await t.http().get('/api/v1/me').set(bearer(victim)).expect(200);
      const list = await t.http().get('/api/v1/me/sessions').set(bearer(attacker)).expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).not.toContain(victim.sessionId);
    });

    it('logout-all revokes every session of the user', async () => {
      const a = await signUpAndLogin(t);
      const b = (await login(a.email, STRONG_PASSWORD, 'ios')).body.data;
      await t.http().post('/api/v1/auth/logout-all').set(bearer(a)).expect(204);
      expect((await t.http().get('/api/v1/me').set(bearer(a))).body.error.code).toBe('SESSION_REVOKED');
      expect((await t.http().get('/api/v1/me').set('Authorization', `Bearer ${b.accessToken}`)).body.error.code).toBe('SESSION_REVOKED');
    });
  });
});
