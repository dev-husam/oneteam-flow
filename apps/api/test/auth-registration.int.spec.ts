import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryOutbox } from '../src/infra/mail/mail.service.js';
import { STRONG_PASSWORD, createTestApp, mailTo, tokenFromMail, uniqueEmail, waitForMail, type TestApp } from './helpers/app.js';

describe('registration and e-mail verification', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(async () => t.app.close());

  const register = (body: Record<string, unknown>) => t.http().post('/api/v1/auth/register').send(body);

  it('creates the account, records consent and sends a verification mail', async () => {
    const email = uniqueEmail();
    const res = await register({ fullName: 'Sara Ahmed', email, password: STRONG_PASSWORD, acceptTerms: true, locale: 'ar' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { status: 'verification_sent' } });

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email }, include: { consentRecords: true } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.consentRecords).toHaveLength(1);
    expect(user.consentRecords[0]?.documentVersion).toBeTruthy();

    const mail = await waitForMail(mailTo(email, 'بريدك')); // Arabic template for locale "ar"
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.text).toContain('/ar/verify-email?token=');
  });

  it('answers identically for an already registered e-mail (no enumeration) and warns the owner', async () => {
    const email = uniqueEmail();
    const first = await register({ fullName: 'First', email, password: STRONG_PASSWORD, acceptTerms: true });
    const second = await register({ fullName: 'Second', email, password: STRONG_PASSWORD, acceptTerms: true });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    await waitForMail(mailTo(email, 'Someone tried'));
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('survives a registration race for the same e-mail', async () => {
    const email = uniqueEmail();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => register({ fullName: 'Racer', email, password: STRONG_PASSWORD, acceptTerms: true })),
    );
    expect(results.map((r) => r.status)).toEqual([202, 202, 202, 202]);
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('rejects registration without consent', async () => {
    const res = await register({ fullName: 'No Consent', email: uniqueEmail(), password: STRONG_PASSWORD, acceptTerms: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('rejects weak passwords with machine-readable reasons', async () => {
    const res = await register({ fullName: 'Weak', email: uniqueEmail(), password: 'short', acceptTerms: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
    expect(res.body.error.details.violations).toContain('TOO_SHORT');
  });

  it('rejects unknown properties (mass assignment) and invalid fields with rule names', async () => {
    const res = await register({ fullName: 'X', email: 'not-an-email', password: STRONG_PASSWORD, acceptTerms: true, status: 'SUSPENDED', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const fields = res.body.error.details.fields as { field: string; rules: string[] }[];
    expect(fields.find((f) => f.field === 'role')?.rules).toContain('whitelistValidation');
    expect(fields.find((f) => f.field === 'email')?.rules).toContain('isEmail');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('verifies the e-mail once; the link cannot be reused and garbage is rejected', async () => {
    const email = uniqueEmail();
    await register({ fullName: 'Verify Me', email, password: STRONG_PASSWORD, acceptTerms: true });
    const token = tokenFromMail(await waitForMail(mailTo(email, 'Confirm')));

    await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();

    const again = await t.http().post('/api/v1/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');

    const garbage = await t.http().post('/api/v1/auth/verify-email').send({ token: 'x'.repeat(43) });
    expect(garbage.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');
  });

  it('rejects an expired verification token', async () => {
    const email = uniqueEmail();
    await register({ fullName: 'Late', email, password: STRONG_PASSWORD, acceptTerms: true });
    const token = tokenFromMail(await waitForMail(mailTo(email, 'Confirm')));
    await t.prisma.oneTimeToken.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await t.http().post('/api/v1/auth/verify-email').send({ token });
    expect(res.body.error.code).toBe('ONE_TIME_TOKEN_INVALID');
  });

  it('resends verification for unverified accounts only, with a per-address cooldown', async () => {
    const email = uniqueEmail();
    await register({ fullName: 'Resend', email, password: STRONG_PASSWORD, acceptTerms: true });
    await waitForMail(mailTo(email, 'Confirm'));
    const before = memoryOutbox.filter(mailTo(email, 'Confirm')).length;

    expect((await t.http().post('/api/v1/auth/resend-verification').send({ email })).status).toBe(202);
    await waitForMail((m) => mailTo(email, 'Confirm')(m) && memoryOutbox.filter(mailTo(email, 'Confirm')).length > before);

    // second request inside the cooldown: same neutral answer, no extra mail
    const count = memoryOutbox.filter(mailTo(email, 'Confirm')).length;
    expect((await t.http().post('/api/v1/auth/resend-verification').send({ email })).status).toBe(202);
    await new Promise((r) => setTimeout(r, 400));
    expect(memoryOutbox.filter(mailTo(email, 'Confirm')).length).toBe(count);

    // unknown address: neutral answer
    expect((await t.http().post('/api/v1/auth/resend-verification').send({ email: uniqueEmail('ghost') })).status).toBe(202);
  });
});
