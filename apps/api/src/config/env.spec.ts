import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const base = { WEB_BASE_URL: 'http://localhost:3000', DATABASE_URL: 'mysql://u:p@h/db', REDIS_URL: 'redis://localhost' };
const prod = {
  ...base,
  NODE_ENV: 'production',
  JWT_PRIVATE_KEY: 'k',
  JWT_PUBLIC_KEY: 'k',
  HEALTH_TOKEN: 't',
  MFA_ENCRYPTION_KEY: 'k',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'b',
  S3_ENDPOINT: 'https://r2.example.com',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  CORS_ORIGINS: 'https://app.example.com',
  COOKIE_SECURE: 'true',
};

describe('loadConfig', () => {
  it('applies safe defaults in development', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ NODE_ENV: 'development', PORT: 3001, ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30, COOKIE_SECURE: false });
  });

  it('parses the CORS allow-list', () => {
    expect(loadConfig({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com' }).CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('lists every problem at once and never prints secret values', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://r' })).toThrowError(/WEB_BASE_URL[\s\S]*DATABASE_URL/);
    try {
      loadConfig({ ...base, DATABASE_URL: 'postgres://user:supersecret@h/db' });
    } catch (e) {
      expect(String(e)).not.toContain('supersecret');
    }
  });

  it('accepts a complete production configuration', () => {
    expect(loadConfig(prod).NODE_ENV).toBe('production');
  });

  it.each([
    ['JWT_PRIVATE_KEY', ''],
    ['JWT_PUBLIC_KEY', ''],
    ['HEALTH_TOKEN', ''],
    ['MFA_ENCRYPTION_KEY', ''],
    ['STORAGE_DRIVER', 'local'],
    ['S3_BUCKET', ''],
    ['CORS_ORIGINS', ''],
    ['COOKIE_SECURE', 'false'],
    ['MAIL_TRANSPORT', 'memory'],
  ])('refuses to start in production without a safe %s', (key, value) => {
    expect(() => loadConfig({ ...prod, [key]: value })).toThrowError(new RegExp(key));
  });

  it('rejects out-of-range values', () => {
    expect(() => loadConfig({ ...base, ACCESS_TOKEN_TTL_SECONDS: '5' })).toThrow();
    expect(() => loadConfig({ ...base, PORT: '99999' })).toThrow();
  });
});
