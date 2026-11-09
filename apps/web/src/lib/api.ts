import { createApiClient } from '@pt/api-client';

/** One API client for the whole web app. The refresh token lives in an HttpOnly cookie, never in JS. */
let onAuthLost: (() => void) | undefined;

export const setAuthLostHandler = (fn: (() => void) | undefined) => {
  onAuthLost = fn;
};

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  clientType: 'web',
  onAuthLost: () => onAuthLost?.(),
});
