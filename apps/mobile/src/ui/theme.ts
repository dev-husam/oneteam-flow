import { type DesignTokens } from '@pt/domain';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { selectActiveDesign, useBrand } from '@/stores/brand';

/**
 * The colours screens use, taken from the active design's semantic tokens (the same tokens the web app uses): the
 * organization's own design when it has one, otherwise the platform default. Light and dark follow the phone.
 */
export interface Colors {
  bg: string; surface: string; surface2: string; line: string; lineStrong: string;
  ink: string; ink2: string; muted: string; link: string;
  accent: string; accentInk: string; accentSoft: string;
  selection: string; selectionFg: string;
  actionSecondary: string; actionSecondaryInk: string;
  danger: string; dangerSoft: string; ok: string; okSoft: string; warn: string; warnSoft: string; info: string; infoSoft: string;
}

export function colorsFor(t: DesignTokens): Colors {
  return {
    bg: t.backgroundApp, surface: t.surfaceCard, surface2: t.backgroundSubtle, line: t.borderDefault, lineStrong: t.borderStrong,
    ink: t.textPrimary, ink2: t.textSecondary, muted: t.textMuted, link: t.textLink,
    accent: t.actionPrimary, accentInk: t.actionPrimaryText, accentSoft: t.surfaceAccent,
    selection: t.selectionBackground, selectionFg: t.selectionForeground,
    actionSecondary: t.actionSecondary, actionSecondaryInk: t.actionSecondaryText,
    danger: t.danger, dangerSoft: t.dangerSoft, ok: t.success, okSoft: t.successSoft, warn: t.warning, warnSoft: t.warningSoft, info: t.info, infoSoft: t.infoSoft,
  };
}

export const useColors = (): Colors => {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const config = useBrand((s) => s.config);
  const orgDesign = useBrand((s) => s.orgDesign);
  const personalDesign = useBrand((s) => s.personalDesign);
  const personalAllowed = useBrand((s) => s.personalAllowed);
  const design = useMemo(() => selectActiveDesign({ config, orgDesign, personalDesign, personalAllowed }), [config, orgDesign, personalDesign, personalAllowed]);
  return useMemo(() => colorsFor(design[mode]), [design, mode]);
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;
