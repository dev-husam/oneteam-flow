import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryOutbox } from '../src/infra/mail/mail.service.js';
import { STRONG_PASSWORD, bearer, createTestApp, mailTo, signUpAndLogin, tokenFromMail, uniqueEmail, waitForMail, type TestApp } from './helpers/app.js';

describe('password reset', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  const NEW_PASSWORD = 'a brand new passphrase 42';

  it('resets the password, ends all sessions, and the token is single-use', async () => {
    const s = await signUpAndLogin(t);
    expect((await t.http().post('/api/v1/auth/request-password-reset').send({ email: s.email })).status).toBe(202);
    const token = tokenFromMail(await waitForMail(mailTo(s.email, 'Reset your password')));

    const weak = await t.http().post('/api/v1/auth/reset-password').send({ token, password: 'short' });
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');

    const ok = await t.http().post('/api/v1/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(ok.status).toBe(200);
    await waitForMail(mailTo(s.email, 'password was changed'));

    expect((await t.http().get('/api/v1/me').set(bearer(s))).body.error.code).toBe('SESSION_REVOKED');
    const oldLogin = await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: s.email, password: STRONG_PASSWORD });
    expect(oldLogin.body.error.code).toBe('INVALID_CREDENTIALS');
    await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: s.email, password: NEW_PASSWORD }).expect(200);

    const reuse = await t.http().post('/api/v1/auth/reset-password').send({ token, password: 'yet another passphrase 77' });
    expect(reuse.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');
  });

  it('answers the same for unknown addresses and sends nothing', async () => {
    const ghost = uniqueEmail('ghost');
    const res = await t.http().post('/api/v1/auth/request-password-reset').send({ email: ghost });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 400));
    expect(memoryOutbox.some((m) => m.to === ghost)).toBe(false);
  });

  it('invalidates an older reset link when a newer one is requested', async () => {
    const s = await signUpAndLogin(t);
    await t.http().post('/api/v1/auth/request-password-reset').send({ email: s.email }).expect(202);
    const first = tokenFromMail(await waitForMail(mailTo(s.email, 'Reset your password')));
    // bypass the 60 s mail cooldown to issue a second token
    const { REDIS } = await import('../src/infra/redis/redis.module.js');
    const redis = t.app.get(REDIS);
    await redis.del(...(await redis.keys('auth:mail-cooldown:reset:*')));
    await t.http().post('/api/v1/auth/request-password-reset').send({ email: s.email }).expect(202);
    await waitForMail((m) => mailTo(s.email, 'Reset your password')(m) && tokenFromMail(m) !== first);

    const res = await t.http().post('/api/v1/auth/reset-password').send({ token: first, password: NEW_PASSWORD });
    expect(res.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');
  });

  it('rejects an expired reset token', async () => {
    const s = await signUpAndLogin(t);
    await t.http().post('/api/v1/auth/request-password-reset').send({ email: s.email }).expect(202);
    const token = tokenFromMail(await waitForMail(mailTo(s.email, 'Reset your password')));
    await t.prisma.oneTimeToken.updateMany({ where: { userId: s.userId, purpose: 'PASSWORD_RESET' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await t.http().post('/api/v1/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(res.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');
  });
});
