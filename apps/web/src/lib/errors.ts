'use client';

import { ApiError } from '@pt/api-client';
import { useTranslations } from 'next-intl';

/** Turns any thrown value into a localized sentence, keyed by the API error code. */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return (error: unknown): string => {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN';
    const key = code as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t('UNKNOWN');
  };
}

/** Support reference for server-side failures, so users can quote it. */
export function errorReference(error: unknown): string | undefined {
  return error instanceof ApiError && error.status >= 500 ? error.requestId : undefined;
}
