import type { Locale } from '@pt/i18n';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { applyDirection, deviceLocale } from '@/i18n';

const KEY = 'pt.prefs';

interface PrefsState {
  hydrated: boolean;
  locale: Locale;
  /** Active organization id (not secret; the server re-verifies membership on every call). */
  activeOrgId: string | null;
  /** True when the language direction changed and a restart is needed for mirrored layouts. */
  restartNeeded: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => void;
  setActiveOrg: (id: string | null) => void;
}

const persist = (s: Pick<PrefsState, 'locale' | 'activeOrgId'>) =>
  SecureStore.setItemAsync(KEY, JSON.stringify({ locale: s.locale, activeOrgId: s.activeOrgId })).catch(() => undefined);

export const usePrefs = create<PrefsState>((set, get) => ({
  hydrated: false,
  locale: 'en',
  activeOrgId: null,
  restartNeeded: false,
  async hydrate() {
    let saved: { locale?: Locale; activeOrgId?: string | null } = {};
    try {
      saved = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '{}');
    } catch {
      /* corrupt or missing preferences: start from defaults */
    }
    const locale = saved.locale === 'ar' || saved.locale === 'en' ? saved.locale : deviceLocale();
    set({ hydrated: true, locale, activeOrgId: saved.activeOrgId ?? null, restartNeeded: applyDirection(locale) });
  },
  setLocale(locale) {
    set({ locale, restartNeeded: applyDirection(locale) });
    void persist({ locale, activeOrgId: get().activeOrgId });
  },
  setActiveOrg(activeOrgId) {
    set({ activeOrgId });
    void persist({ locale: get().locale, activeOrgId });
  },
}));
