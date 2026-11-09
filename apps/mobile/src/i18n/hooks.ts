import { ApiError } from '@pt/api-client';
import { useCallback, useMemo } from 'react';
import { createTranslator } from '@/i18n';
import { usePrefs } from '@/stores/prefs';

export const useT = () => {
  const locale = usePrefs((s) => s.locale);
  return useMemo(() => createTranslator(locale), [locale]);
};

/** Any thrown value → a localized sentence, keyed by the API error code (same texts as the web app). */
export function useErrorMessage() {
  const t = useT();
  return useCallback(
    (error: unknown): string => {
      const code = error instanceof ApiError ? error.code : 'UNKNOWN';
      return t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN');
    },
    [t],
  );
}

/** System roles use the category terminology (Trainer, Client…); custom roles show their own name. */
export function useRoleLabel() {
  const t = useT();
  return useCallback(
    (role: { key: string; name: string; labelKey?: string | null }): string =>
      role.labelKey && !role.key.startsWith('custom-') && t.has(role.labelKey) ? t(role.labelKey) : role.name,
    [t],
  );
}
