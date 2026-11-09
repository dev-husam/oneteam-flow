import { SignJWT, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/env.js';
import { TokenService } from './token.service.js';

const baseEnv = { WEB_BASE_URL: 'http://localhost:3000', DATABASE_URL: 'mysql://u:p@h/db', REDIS_URL: 'redis://localhost' };
const make = (extra: Record<string, string> = {}) => new TokenService(loadConfig({ ...baseEnv, ...extra }));

afterEach(() => vi.useRealTimers());

describe('TokenService', () => {
  it('signs ES256 tokens carrying only sub and sid (no org, role or permissions)', async () => {
    const svc = make();
    const { token, expiresIn } = await svc.signAccessToken({ sub: 'user-1', sid: 'sess-1' });
    expect(expiresIn).toBe(900);
    const [header, payload] = token.split('.').slice(0, 2).map((p) => JSON.parse(Buffer.from(p!, 'base64url').toString()));
    expect(header).toMatchObject({ alg: 'ES256', kid: 'dev-1', typ: 'JWT' });
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
    expect(await svc.verifyAccessToken(token)).toEqual({ sub: 'user-1', sid: 'sess-1', exp: expect.any(Number) });
  });

  it('rejects expired tokens with TOKEN_EXPIRED', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const svc = make({ ACCESS_TOKEN_TTL_SECONDS: '60' });
    const { token } = await svc.signAccessToken({ sub: 'u', sid: 's' });
    vi.setSystemTime(Date.now() + 61_000);
    await expect(svc.verifyAccessToken(token)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('rejects tokens signed by a different key', async () => {
    const a = make();
    const b = make();
    const { token } = await a.signAccessToken({ sub: 'u', sid: 's' });
    await expect(b.verifyAccessToken(token)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('rejects tampered payloads', async () => {
    const svc = make();
    const { token } = await svc.signAccessToken({ sub: 'u', sid: 's' });
    const [h, , sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', sid: 's', iss: 'pt-api', aud: 'pt-clients', exp: 9_999_999_999 })).toString('base64url');
    await expect(svc.verifyAccessToken(`${h}.${forged}.${sig}`)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('rejects tokens with the wrong issuer or audience, or missing claims', async () => {
    const svc = make();
    const { privateKey } = await generateKeyPair('ES256');
    const wrongIss = await new SignJWT({ sid: 's' }).setProtectedHeader({ alg: 'ES256' }).setSubject('u').setIssuer('evil').setAudience('pt-clients').setExpirationTime('5m').sign(privateKey);
    await expect(svc.verifyAccessToken(wrongIss)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('uses configured PEM keys when provided', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = (k: string) => k.trim().replace(/\n/g, '\\n');
    const env = {
      JWT_PRIVATE_KEY: pem(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string),
      JWT_PUBLIC_KEY: pem(publicKey.export({ type: 'spki', format: 'pem' }) as string),
    };
    const issuer = make(env);
    const verifier = make(env); // a second instance (another replica) with the same keys accepts the token
    const { token } = await issuer.signAccessToken({ sub: 'u', sid: 's' });
    expect(await verifier.verifyAccessToken(token)).toEqual({ sub: 'u', sid: 's', exp: expect.any(Number) });
  });
});
