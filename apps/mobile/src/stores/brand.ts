import { DEFAULT_PUBLIC_CONFIG, parseDesignTheme, parsePublicConfig, resolveDesign, type DesignTheme, type PublicConfig } from '@pt/domain';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'pt.brand';

interface BrandState {
  config: PublicConfig;
  /** The active organization's own design, when it uses another than the platform default. Cleared when the organization changes. */
  orgDesign: DesignTheme | null;
  setOrgDesign: (design: unknown) => void;
  /** The person's own choice (from Profile → Appearance), and whether the open organization lets it apply. */
  personalDesign: DesignTheme | null;
  personalAllowed: boolean;
  setPersonalDesign: (design: unknown) => void;
  setPersonalAllowed: (allowed: boolean) => void;
  /**
   * Shows the last configuration seen (instant, works offline), then asks the server for the current one.
   * Everything read from the cache or the network is re-validated, so a damaged value falls back to the defaults.
   */
  load: (fetchConfig: () => Promise<unknown>) => Promise<void>;
}

export const useBrand = create<BrandState>((set) => ({
  config: DEFAULT_PUBLIC_CONFIG,
  orgDesign: null,
  personalDesign: null,
  personalAllowed: true,
  setPersonalDesign: (design) => set({ personalDesign: parseDesignTheme(design) }),
  setPersonalAllowed: (personalAllowed) => set({ personalAllowed }),
  // Re-validated like everything else that arrives from outside: a damaged design is ignored.
  setOrgDesign: (design) => set({ orgDesign: parseDesignTheme(design) }),
  async load(fetchConfig) {
    try {
      const cached = await SecureStore.getItemAsync(KEY);
      if (cached) set({ config: parsePublicConfig(JSON.parse(cached)) });
    } catch {
      /* no cache yet, or unreadable: keep the defaults */
    }
    try {
      const config = parsePublicConfig(await fetchConfig());
      set({ config });
      await SecureStore.setItemAsync(KEY, JSON.stringify(config)).catch(() => undefined);
    } catch {
      /* offline or the server is down: the cached or default identity stays */
    }
  },
}));

/** The design on screen: the person's own choice, else the open organization's, else the platform default. */
export const selectActiveDesign = (s: Pick<BrandState, 'config' | 'orgDesign' | 'personalDesign' | 'personalAllowed'>): DesignTheme =>
  resolveDesign({ platform: s.config.design, org: s.orgDesign, personal: s.personalDesign, personalAllowed: s.personalAllowed });
