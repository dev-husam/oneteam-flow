import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, bearer, createTestApp, signUpAndLogin, type TestApp } from './helpers/app.js';

describe('refresh token rotation', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  const refresh = (token: string) => t.http().post('/api/v1/auth/refresh').set('x-client-type', 'ios').send({ refreshToken: token });

  it('issues a new access and refresh token and keeps the session', async () => {
    const s = await signUpAndLogin(t);
    const res = await refresh(s.refreshToken);
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(s.refreshToken);
    expect(res.body.data.sessionId).toBe(s.sessionId);
    await t.http().get('/api/v1/me').set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
  });

  it('stores only hashes of refresh tokens', async () => {
    const s = await signUpAndLogin(t);
    const rows = await t.prisma.refreshToken.findMany({ where: { sessionId: s.sessionId } });
    expect(rows.every((r) => r.tokenHash.length === 64 && r.tokenHash !== s.refreshToken)).toBe(true);
  });

  it('a reused (stolen) token revokes the whole session after the grace window', async () => {
    const s = await signUpAndLogin(t);
    const rotated = (await refresh(s.refreshToken)).body.data;

    // Simulate time passing beyond the 5 s concurrency grace window.
    await t.prisma.refreshToken.updateMany({ where: { sessionId: s.sessionId, usedAt: { not: null } }, data: { usedAt: new Date(Date.now() - 60_000) } });

    const replay = await refresh(s.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    // The legitimate holder of the newest token is kicked out too: the whole family is dead.
    expect((await refresh(rotated.refreshToken)).status).toBe(401);
    const dead = await t.http().get('/api/v1/me').set('Authorization', `Bearer ${rotated.accessToken}`);
    expect(dead.body.error.code).toBe('SESSION_REVOKED');
    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(session.revokeReason).toBe('refresh_token_reuse');
  });

  it('an immediate replay (concurrent tabs) is refused but does not kill the session', async () => {
    const s = await signUpAndLogin(t);
    const rotated = (await refresh(s.refreshToken)).body.data;
    const replay = await refresh(s.refreshToken);
    expect(replay.status).toBe(401);
    expect((await refresh(rotated.refreshToken)).status).toBe(200);
  });

  it('parallel refreshes with the same token: exactly one wins and the session survives', async () => {
    const s = await signUpAndLogin(t);
    const results = await Promise.all(Array.from({ length: 6 }, () => refresh(s.refreshToken)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    const winner = results.find((r) => r.status === 200)!;
    await t.http().get('/api/v1/me').set('Authorization', `Bearer ${winner.body.data.accessToken}`).expect(200);
  });

  it('rejects unknown, expired and revoked-session tokens', async () => {
    expect((await refresh('A'.repeat(43))).body.error.code).toBe('REFRESH_TOKEN_INVALID');

    const expired = await signUpAndLogin(t);
    await t.prisma.refreshToken.updateMany({ where: { sessionId: expired.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(expired.refreshToken)).body.error.code).toBe('REFRESH_TOKEN_INVALID');

    const revoked = await signUpAndLogin(t);
    await t.http().post('/api/v1/auth/logout').send({ refreshToken: revoked.refreshToken }).expect(204);
    expect((await refresh(revoked.refreshToken)).body.error.code).toBe('REFRESH_TOKEN_INVALID');
    expect((await t.http().get('/api/v1/me').set(bearer(revoked))).body.error.code).toBe('SESSION_REVOKED');
  });

  it('refuses to refresh a suspended account and ends its session', async () => {
    const s = await signUpAndLogin(t);
    await t.prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
    const res = await refresh(s.refreshToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } })).revokedAt).not.toBeNull();
  });

  describe('web cookie flow', () => {
    const webLogin = async (email: string) => {
      const res = await t.http().post('/api/v1/auth/login').set('x-client-type', 'web').send({ email, password: STRONG_PASSWORD });
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      return { cookie, body: res.body };
    };

    it('refreshes with the cookie, rotates it, and clears it on logout', async () => {
      const s = await signUpAndLogin(t);
      const { cookie } = await webLogin(s.email);

      const res = await t.http().post('/api/v1/auth/refresh').set('Cookie', cookie).set('x-client-type', 'web').set('Origin', 'http://localhost:3000');
      expect(res.status).toBe(200);
      expect(res.body.data.refreshToken).toBeUndefined();
      const rotated = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      expect(rotated).not.toBe(cookie);

      const out = await t.http().post('/api/v1/auth/logout').set('Cookie', rotated).set('x-client-type', 'web').set('Origin', 'http://localhost:3000');
      expect(out.status).toBe(204);
      expect(String(out.headers['set-cookie'])).toMatch(/pt_rt=;/);
      const after = await t.http().post('/api/v1/auth/refresh').set('Cookie', rotated).set('x-client-type', 'web').set('Origin', 'http://localhost:3000');
      expect(after.status).toBe(401);
    });

    it('blocks cross-site and header-less cookie refreshes (CSRF)', async () => {
      const s = await signUpAndLogin(t);
      const { cookie } = await webLogin(s.email);

      const evil = await t.http().post('/api/v1/auth/refresh').set('Cookie', cookie).set('x-client-type', 'web').set('Origin', 'https://evil.example');
      expect(evil.status).toBe(403);
      expect(evil.body.error.code).toBe('CSRF_REJECTED');

      const noHeader = await t.http().post('/api/v1/auth/refresh').set('Cookie', cookie).set('x-client-type', 'ios').set('Origin', 'http://localhost:3000');
      expect(noHeader.body.error.code).toBe('CSRF_REJECTED');
    });
  });
});
