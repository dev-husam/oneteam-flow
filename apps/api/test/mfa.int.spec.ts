import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createTestApp, enableMfa, signUpAndLogin, STRONG_PASSWORD, totpCode, type TestApp } from './helpers/app.js';

const code = (res: { body: { error?: { code?: string } } }) => res.body.error?.code;

describe('TOTP two-factor authentication', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  const login = (email: string, client = 'ios') => t.http().post('/api/v1/auth/login').set('x-client-type', client).send({ email, password: STRONG_PASSWORD });
  const mfaLogin = (mfaToken: string, c: string, client = 'ios') => t.http().post('/api/v1/auth/mfa/login').set('x-client-type', client).send({ mfaToken, code: c });
  /** Allows the same time step to be used again in a test (a real user would wait 30 s). */
  const resetReplayGuard = (userId: string) => t.prisma.mfaFactor.update({ where: { userId }, data: { lastUsedStep: null } });

  it('enrollment is inert until a valid code confirms it; the secret is encrypted at rest', async () => {
    const s = await signUpAndLogin(t);
    const enroll = (await as(t, s).post('/api/v1/me/mfa/enroll').expect(200)).body.data;
    expect(enroll.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enroll.otpauthUri).toContain(`secret=${enroll.secret}`);
    const row = await t.prisma.mfaFactor.findUniqueOrThrow({ where: { userId: s.userId } });
    expect(row.secretEnc).not.toContain(enroll.secret);
    expect(row.confirmedAt).toBeNull();

    // unconfirmed: logging in still needs no code
    expect((await login(s.email)).body.data.accessToken).toBeTruthy();

    expect(code(await as(t, s).post('/api/v1/me/mfa/confirm', { code: '000000' }))).toBe('MFA_CODE_INVALID');
    const ok = await as(t, s).post('/api/v1/me/mfa/confirm', { code: totpCode(enroll.secret) }).expect(200);
    expect(ok.body.data.recoveryCodes).toHaveLength(8);
    expect(new Set(ok.body.data.recoveryCodes).size).toBe(8);
    expect(ok.body.data.recoveryCodes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    expect((await as(t, s).get('/api/v1/me').expect(200)).body.data.mfaEnabled).toBe(true);
    const hashes = await t.prisma.mfaRecoveryCode.findMany({ where: { userId: s.userId } });
    expect(hashes.map((h) => h.codeHash)).not.toContain(ok.body.data.recoveryCodes[0]); // only hashes are stored
    expect(code(await as(t, s).post('/api/v1/me/mfa/enroll'))).toBe('MFA_ALREADY_ENABLED');
  });

  it('sign-in becomes two steps: no session exists until the second factor is proven', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);

    const first = await login(s.email);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(first.body.data.accessToken).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();
    const sessionsBefore = await t.prisma.userSession.count({ where: { userId: s.userId } });

    expect(code(await mfaLogin(first.body.data.mfaToken, '123456'))).toBe('MFA_CODE_INVALID');
    const second = await mfaLogin(first.body.data.mfaToken, totpCode(secret, 1));
    expect(second.status).toBe(200);
    expect(second.body.data.accessToken).toBeTruthy();
    expect(second.body.data.refreshToken).toBeTruthy();
    expect(await t.prisma.userSession.count({ where: { userId: s.userId } })).toBe(sessionsBefore + 1);
    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: second.body.data.sessionId } });
    expect(session.mfaVerifiedAt).not.toBeNull();
    await as(t, { accessToken: second.body.data.accessToken }).get('/api/v1/me').expect(200);
  });

  it('web clients receive the refresh cookie only after the second step', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);
    const first = await login(s.email, 'web');
    expect(first.headers['set-cookie']).toBeUndefined();
    const second = await mfaLogin(first.body.data.mfaToken, totpCode(secret, 1), 'web');
    expect(String(second.headers['set-cookie'])).toMatch(/pt_rt=.*HttpOnly/);
    expect(second.body.data.refreshToken).toBeUndefined();
  });

  it('a code works once (replay protection), recovery codes work once', async () => {
    const s = await signUpAndLogin(t);
    const { secret, recoveryCodes } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);

    const a = (await login(s.email)).body.data.mfaToken;
    const code1 = totpCode(secret, 1);
    await mfaLogin(a, code1).expect(200);
    const b = (await login(s.email)).body.data.mfaToken;
    expect(code(await mfaLogin(b, code1))).toBe('MFA_CODE_INVALID'); // same code again

    const c = (await login(s.email)).body.data.mfaToken;
    await mfaLogin(c, recoveryCodes[0]!).expect(200);
    const d = (await login(s.email)).body.data.mfaToken;
    expect(code(await mfaLogin(d, recoveryCodes[0]!))).toBe('MFA_CODE_INVALID');
    await mfaLogin(d, recoveryCodes[1]!.toUpperCase()).expect(200); // case-insensitive
    expect(await t.prisma.auditLog.count({ where: { actorUserId: s.userId, action: 'auth.mfa_recovery_code_used' } })).toBe(2);
  });

  it('the pending token and the access token are not interchangeable', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);
    const pending = (await login(s.email)).body.data.mfaToken as string;
    expect(code(await t.http().get('/api/v1/me').set('Authorization', `Bearer ${pending}`))).toBe('TOKEN_INVALID');
    expect(code(await mfaLogin(s.accessToken, totpCode(secret, 1)))).toBe('MFA_TOKEN_INVALID');
    expect(code(await mfaLogin('x'.repeat(40), totpCode(secret, 1)))).toBe('MFA_TOKEN_INVALID');
  });

  it('five wrong codes lock the second step, even for the right code', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);
    const token = (await login(s.email)).body.data.mfaToken;
    for (let i = 0; i < 5; i++) expect(code(await mfaLogin(token, '000000'))).toBe('MFA_CODE_INVALID');
    const locked = await mfaLogin(token, totpCode(secret, 1));
    expect(locked.status).toBe(429);
    expect(code(locked)).toBe('TOO_MANY_LOGIN_ATTEMPTS');
  });

  it('turning MFA off needs the password and a valid code', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    await resetReplayGuard(s.userId);
    expect(code(await as(t, s).post('/api/v1/me/mfa/disable', { password: 'wrong password', code: totpCode(secret, 1) }))).toBe('INVALID_CREDENTIALS');
    expect(code(await as(t, s).post('/api/v1/me/mfa/disable', { password: STRONG_PASSWORD, code: '111111' }))).toBe('MFA_CODE_INVALID');
    await as(t, s).post('/api/v1/me/mfa/disable', { password: STRONG_PASSWORD, code: totpCode(secret, 1) }).expect(204);
    expect((await login(s.email)).body.data.accessToken).toBeTruthy();
    expect(await t.prisma.mfaRecoveryCode.count({ where: { userId: s.userId } })).toBe(0);
    expect(code(await as(t, s).post('/api/v1/me/mfa/disable', { password: STRONG_PASSWORD, code: '123456' }))).toBe('MFA_NOT_ENABLED');
  });

  it('disabling is blocked for platform staff', async () => {
    const s = await signUpAndLogin(t);
    const { secret } = await enableMfa(t, s);
    const role = await t.prisma.role.findUniqueOrThrow({ where: { scopeKey_key: { scopeKey: 'platform', key: 'super_admin' } } });
    await t.prisma.platformRoleAssignment.create({ data: { userId: s.userId, roleId: role.id } });
    await resetReplayGuard(s.userId);
    expect(code(await as(t, s).post('/api/v1/me/mfa/disable', { password: STRONG_PASSWORD, code: totpCode(secret, 1) }))).toBe('MFA_CANNOT_DISABLE');
    await t.prisma.platformRoleAssignment.deleteMany({ where: { userId: s.userId } });
  });

  it('is audited', async () => {
    const s = await signUpAndLogin(t);
    await enableMfa(t, s);
    expect(await t.prisma.auditLog.count({ where: { actorUserId: s.userId, action: 'auth.mfa_enabled' } })).toBe(1);
  });
});
