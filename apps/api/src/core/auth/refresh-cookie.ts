import type { Request, Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

export const REFRESH_COOKIE = 'pt_rt';
const COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: COOKIE_PATH,
    domain: config.COOKIE_DOMAIN || undefined,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: COOKIE_PATH,
    domain: config.COOKIE_DOMAIN || undefined,
  });
}

/**
 * CSRF defence for cookie-authenticated requests: the Origin (when present) must be in the allow-list
 * and the custom x-client-type header must be set (cross-site HTML forms cannot send custom headers).
 */
export function assertCookieRequestAllowed(req: Request, config: AppConfig): void {
  const origin = req.header('origin');
  if (origin && !config.CORS_ORIGINS.includes(origin)) throw new AppError('CSRF_REJECTED');
  if (req.header('x-client-type')?.toLowerCase() !== 'web') throw new AppError('CSRF_REJECTED');
}

export function readRefreshToken(
  req: Request,
  config: AppConfig,
  bodyToken?: string,
): { token?: string; fromCookie: boolean } {
  if (bodyToken) return { token: bodyToken, fromCookie: false };
  const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (cookie) {
    assertCookieRequestAllowed(req, config);
    return { token: cookie, fromCookie: true };
  }
  return { fromCookie: false };
}
