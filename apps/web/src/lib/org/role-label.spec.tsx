import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ar, en } from '@pt/i18n';
import { useRoleLabel } from './org-context';

const wrap = (locale: 'en' | 'ar') => ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ar}>{children}</NextIntlClientProvider>
);

describe('useRoleLabel', () => {
  it('uses the category terminology for system roles', () => {
    const { result } = renderHook(() => useRoleLabel(), { wrapper: wrap('en') });
    expect(result.current({ key: 'practitioner', name: 'practitioner', labelKey: 'role.practitioner.trainer' })).toBe('Trainer');
    expect(result.current({ key: 'participant', name: 'participant', labelKey: 'role.participant.student' })).toBe('Student');
  });

  it('localizes the same role in Arabic', () => {
    const { result } = renderHook(() => useRoleLabel(), { wrapper: wrap('ar') });
    expect(result.current({ key: 'practitioner', name: 'practitioner', labelKey: 'role.practitioner.trainer' })).toBe('مدرّب');
  });

  it('shows the given name for custom roles, whatever the label key says', () => {
    const { result } = renderHook(() => useRoleLabel(), { wrapper: wrap('en') });
    expect(result.current({ key: 'custom-night-shift', name: 'Night shift', labelKey: 'role.owner.default' })).toBe('Night shift');
  });

  it('falls back to the name for unknown label keys (future categories)', () => {
    const { result } = renderHook(() => useRoleLabel(), { wrapper: wrap('en') });
    expect(result.current({ key: 'practitioner', name: 'Pilot', labelKey: 'role.practitioner.pilot' })).toBe('Pilot');
    expect(result.current({ key: 'guardian', name: 'Guardian', labelKey: null })).toBe('Guardian');
  });

  it('every label key the server can produce has an English and Arabic text', async () => {
    const { roleLabelKey, CATEGORY_KEYS, ROLE_KEYS } = await import('@pt/domain');
    const get = (tree: unknown, path: string) => path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], tree);
    for (const category of CATEGORY_KEYS) {
      for (const role of ROLE_KEYS) {
        const key = roleLabelKey(role, category);
        expect(get(en, key), `en ${key}`).toBeTypeOf('string');
        expect(get(ar, key), `ar ${key}`).toBeTypeOf('string');
      }
    }
  });
});
