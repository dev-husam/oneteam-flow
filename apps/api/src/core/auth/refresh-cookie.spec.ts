import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/env.js';
import { assertCookieRequestAllowed, readRefreshToken } from './refresh-cookie.js';

const config = loadConfig({ WEB_BASE_URL: 'http://localhost:3000', DATABASE_URL: 'mysql://u:p@h/db', REDIS_URL: 'redis://x', CORS_ORIGINS: 'https://app.example.com' });
const req = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
  ({ header: (n: string) => headers[n.toLowerCase()], cookies }) as unknown as Request;

describe('cookie CSRF guard', () => {
  it('accepts an allowed origin with the custom header', () => {
    expect(() => assertCookieRequestAllowed(req({ origin: 'https://app.example.com', 'x-client-type': 'web' }), config)).not.toThrow();
  });
  it('accepts a request without Origin (non-browser or same-origin) when the custom header is set', () => {
    expect(() => assertCookieRequestAllowed(req({ 'x-client-type': 'web' }), config)).not.toThrow();
  });
  it('rejects foreign origins', () => {
    expect(() => assertCookieRequestAllowed(req({ origin: 'https://evil.example', 'x-client-type': 'web' }), config)).toThrowError();
  });
  it('rejects a missing or non-web client header', () => {
    expect(() => assertCookieRequestAllowed(req({ origin: 'https://app.example.com' }), config)).toThrowError();
    expect(() => assertCookieRequestAllowed(req({ 'x-client-type': 'ios' }), config)).toThrowError();
  });
});

describe('readRefreshToken', () => {
  it('prefers the body (native) and does not apply the cookie guard to it', () => {
    expect(readRefreshToken(req({}), config, 'body-token')).toEqual({ token: 'body-token', fromCookie: false });
  });
  it('reads the cookie and enforces the guard', () => {
    expect(readRefreshToken(req({ 'x-client-type': 'web' }, { pt_rt: 'cookie-token' }), config)).toEqual({ token: 'cookie-token', fromCookie: true });
    expect(() => readRefreshToken(req({}, { pt_rt: 'cookie-token' }), config)).toThrowError();
  });
  it('returns nothing when no token is present', () => {
    expect(readRefreshToken(req({}), config)).toEqual({ fromCookie: false });
  });
});
