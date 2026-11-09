import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS } from '../src/infra/redis/redis.module.js';
import { createTestApp, uniqueEmail, type TestApp } from './helpers/app.js';

describe('rate limiting', () => {
  let t: TestApp;
  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    t = await createTestApp();
    const redis = t.app.get(REDIS);
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => {
    const redis = t.app.get(REDIS);
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
    await t.app.close();
    process.env.RATE_LIMIT_ENABLED = 'false';
  });

  it('limits login attempts per client and answers with the standard error shape', async () => {
    const statuses: number[] = [];
    let last: { body: { error: { code: string } } } | undefined;
    for (let i = 0; i < 12; i++) {
      const res = await t.http().post('/api/v1/auth/login').set('x-client-type', 'ios').send({ email: uniqueEmail(`rate${i}`), password: 'nope' }); // fresh address each time: the per-address lockout lives 15 min in Redis
      statuses.push(res.status);
      last = res;
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(last!.body.error.code).toBe('RATE_LIMITED');
  });

  it('never throttles liveness probes', async () => {
    for (let i = 0; i < 150; i++) await t.http().get('/api/v1/health/live').expect(200);
  });
});
