/**
 * Design system: a theme is a complete set of semantic colour tokens for light and dark mode plus a corner style and
 * a typeface. Components use the tokens (never raw colours), so an administrator can change or add whole designs.
 * The built-in "OneTeam Flow" theme follows the product's colour specification; "Classic" keeps the earlier blue look.
 * Pure rules only: web and mobile import this package, so they can never disagree about what a theme means.
 */

// ---------------------------------------------------------------- colour maths

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** WCAG relative luminance and contrast ratio. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- tokens

/** Token groups, in the order an editor shows them. Every key exists in both modes. */
export const DESIGN_TOKEN_GROUPS = {
  surfaces: ['backgroundApp', 'backgroundSubtle', 'surfaceCard', 'surfaceRaised', 'surfaceSunken', 'surfaceBrand', 'surfaceBrandSoft', 'surfaceAccent'],
  text: ['textPrimary', 'textSecondary', 'textMuted', 'textPlaceholder', 'textInverse', 'textLink'],
  borders: ['borderDefault', 'borderStrong', 'borderFocus'],
  actions: ['actionPrimary', 'actionPrimaryHover', 'actionPrimaryText', 'actionSecondary', 'actionSecondaryHover', 'actionSecondaryText'],
  selection: ['selectionBackground', 'selectionForeground', 'selectionLine'],
  charts: ['progressTrack', 'progressFill', 'chartPrimary', 'chartSecondary', 'chartHighlight'],
  status: ['success', 'successSoft', 'successLine', 'warning', 'warningSoft', 'warningLine', 'danger', 'dangerSoft', 'dangerLine', 'info', 'infoSoft', 'infoLine'],
  sidebar: ['sidebarBackground', 'sidebarText', 'sidebarMuted', 'sidebarHover', 'sidebarActive', 'sidebarActiveText', 'sidebarIndicator'],
} as const;
export type DesignTokenGroup = keyof typeof DESIGN_TOKEN_GROUPS;
export const DESIGN_TOKEN_KEYS = Object.values(DESIGN_TOKEN_GROUPS).flat() as readonly DesignTokenKey[];
export type DesignTokenKey = (typeof DESIGN_TOKEN_GROUPS)[DesignTokenGroup][number];
export type DesignTokens = Record<DesignTokenKey, string>;

export const DESIGN_RADII = ['sharp', 'default', 'round'] as const;
export type DesignRadius = (typeof DESIGN_RADII)[number];
/** `jakarta` is Plus Jakarta Sans (Latin); Arabic text always uses IBM Plex Sans Arabic. */
export const DESIGN_FONTS = ['plex', 'jakarta'] as const;
export type DesignFont = (typeof DESIGN_FONTS)[number];

export interface DesignDefinition {
  name: string;
  description: string;
  radius: DesignRadius;
  font: DesignFont;
  light: DesignTokens;
  dark: DesignTokens;
}
/** A stored or built-in theme. */
export interface DesignTheme extends DesignDefinition {
  key: string;
}

export const DESIGN_KEY = /^[a-z][a-z0-9-]{1,39}$/;
export const DESIGN_LIMITS = { name: 60, description: 200 } as const;

// ---------------------------------------------------------------- built-in themes

const oneteamLight: DesignTokens = {
  backgroundApp: '#F8FAFC', backgroundSubtle: '#F1F5F9', surfaceCard: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#E8F0FA', surfaceBrand: '#0D1A33', surfaceBrandSoft: '#E8F0FA', surfaceAccent: '#FFF1EA',
  textPrimary: '#0D1A33', textSecondary: '#475569', textMuted: '#64748B', textPlaceholder: '#64748B', textInverse: '#FFFFFF', textLink: '#25436B',
  borderDefault: '#E2E8F0', borderStrong: '#CBD5E1', borderFocus: '#25436B',
  actionPrimary: '#FF6A2B', actionPrimaryHover: '#E65318', actionPrimaryText: '#0D1A33', actionSecondary: '#0D1A33', actionSecondaryHover: '#172B4D', actionSecondaryText: '#FFFFFF',
  selectionBackground: '#E8F0FA', selectionForeground: '#0D1A33', selectionLine: '#D2E1F4',
  progressTrack: '#E2E8F0', progressFill: '#8FB4E3', chartPrimary: '#25436B', chartSecondary: '#8FB4E3', chartHighlight: '#FF6A2B',
  success: '#166534', successSoft: '#ECFDF3', successLine: '#BBF7D0', warning: '#92400E', warningSoft: '#FFFAEB', warningLine: '#FDE68A',
  danger: '#B91C1C', dangerSoft: '#FEF2F2', dangerLine: '#FECACA', info: '#1E40AF', infoSoft: '#EFF6FF', infoLine: '#BFDBFE',
  sidebarBackground: '#0D1A33', sidebarText: '#CBD5E1', sidebarMuted: '#94A3B8', sidebarHover: '#172B4D', sidebarActive: '#25436B', sidebarActiveText: '#FFFFFF', sidebarIndicator: '#FF6A2B',
};
const oneteamDark: DesignTokens = {
  backgroundApp: '#081326', backgroundSubtle: '#0D1A33', surfaceCard: '#12213D', surfaceRaised: '#172B4D', surfaceSunken: '#081326', surfaceBrand: '#0D1A33', surfaceBrandSoft: '#172B4D', surfaceAccent: '#422719',
  textPrimary: '#F8FAFC', textSecondary: '#CBD5E1', textMuted: '#94A3B8', textPlaceholder: '#94A3B8', textInverse: '#0D1A33', textLink: '#8FB4E3',
  borderDefault: '#263955', borderStrong: '#475569', borderFocus: '#8FB4E3',
  actionPrimary: '#FF6A2B', actionPrimaryHover: '#FF824D', actionPrimaryText: '#0D1A33', actionSecondary: '#8FB4E3', actionSecondaryHover: '#A8C5EB', actionSecondaryText: '#0D1A33',
  selectionBackground: '#203858', selectionForeground: '#F8FAFC', selectionLine: '#2F4C75',
  progressTrack: '#263955', progressFill: '#8FB4E3', chartPrimary: '#8FB4E3', chartSecondary: '#5D83B8', chartHighlight: '#FF824D',
  success: '#86EFAC', successSoft: '#123323', successLine: '#1C5B3B', warning: '#FCD34D', warningSoft: '#3B2A12', warningLine: '#5C4318',
  danger: '#FCA5A5', dangerSoft: '#3B171B', dangerLine: '#5C2428', info: '#93C5FD', infoSoft: '#142B49', infoLine: '#1F4A7A',
  sidebarBackground: '#0D1A33', sidebarText: '#CBD5E1', sidebarMuted: '#94A3B8', sidebarHover: '#172B4D', sidebarActive: '#25436B', sidebarActiveText: '#FFFFFF', sidebarIndicator: '#FF6A2B',
};

const classicLight: DesignTokens = {
  backgroundApp: '#F5F6F8', backgroundSubtle: '#F0F2F5', surfaceCard: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#E6E9EE', surfaceBrand: '#111726', surfaceBrandSoft: '#E9EFFF', surfaceAccent: '#E9EFFF',
  textPrimary: '#151A25', textSecondary: '#3A4152', textMuted: '#667085', textPlaceholder: '#667085', textInverse: '#FFFFFF', textLink: '#2C59E8',
  borderDefault: '#E0E4EA', borderStrong: '#C9CFDA', borderFocus: '#2C59E8',
  actionPrimary: '#2C59E8', actionPrimaryHover: '#2147C4', actionPrimaryText: '#FFFFFF', actionSecondary: '#111726', actionSecondaryHover: '#1A2236', actionSecondaryText: '#FFFFFF',
  selectionBackground: '#E9EFFF', selectionForeground: '#2147C4', selectionLine: '#C2D2FB',
  progressTrack: '#E0E4EA', progressFill: '#2C59E8', chartPrimary: '#2C59E8', chartSecondary: '#6C8DFF', chartHighlight: '#B25400',
  success: '#067647', successSoft: '#E7F6EE', successLine: '#B7E4CC', warning: '#B25400', warningSoft: '#FFF3E0', warningLine: '#F5D9A8',
  danger: '#D12B1F', dangerSoft: '#FDEEEC', dangerLine: '#F3C4C0', info: '#2147C4', infoSoft: '#E9EFFF', infoLine: '#C2D2FB',
  sidebarBackground: '#111726', sidebarText: '#C5CCDB', sidebarMuted: '#7C869C', sidebarHover: '#1A2236', sidebarActive: '#232D47', sidebarActiveText: '#FFFFFF', sidebarIndicator: '#6C8DFF',
};
const classicDark: DesignTokens = {
  backgroundApp: '#0C111B', backgroundSubtle: '#1A2233', surfaceCard: '#131A28', surfaceRaised: '#1A2233', surfaceSunken: '#0C111B', surfaceBrand: '#111726', surfaceBrandSoft: '#1B2748', surfaceAccent: '#1B2748',
  textPrimary: '#EEF1F7', textSecondary: '#C7CEDD', textMuted: '#8D97AD', textPlaceholder: '#8D97AD', textInverse: '#EEF1F7', textLink: '#6C8DFF',
  borderDefault: '#27324A', borderStrong: '#3A4766', borderFocus: '#6C8DFF',
  actionPrimary: '#6C8DFF', actionPrimaryHover: '#86A1FF', actionPrimaryText: '#0B1226', actionSecondary: '#232D42', actionSecondaryHover: '#2E3A54', actionSecondaryText: '#EEF1F7',
  selectionBackground: '#1B2748', selectionForeground: '#B9C8FF', selectionLine: '#2F4280',
  progressTrack: '#27324A', progressFill: '#6C8DFF', chartPrimary: '#6C8DFF', chartSecondary: '#8FA6F0', chartHighlight: '#FFB455',
  success: '#4CD08B', successSoft: '#102B20', successLine: '#1C5B3B', warning: '#FFB455', warningSoft: '#3A2A12', warningLine: '#5C4318',
  danger: '#FF7A70', dangerSoft: '#3A1A1A', dangerLine: '#5C2428', info: '#B9C8FF', infoSoft: '#1B2748', infoLine: '#2F4280',
  sidebarBackground: '#111726', sidebarText: '#C5CCDB', sidebarMuted: '#7C869C', sidebarHover: '#1A2236', sidebarActive: '#232D47', sidebarActiveText: '#FFFFFF', sidebarIndicator: '#6C8DFF',
};

export const BUILT_IN_DESIGNS: readonly DesignTheme[] = [
  { key: 'oneteam-flow', name: 'OneTeam Flow', description: 'Midnight Navy, Dusk Blue and Sunset Orange: calm and professional, with orange kept for the main action.', radius: 'default', font: 'jakarta', light: oneteamLight, dark: oneteamDark },
  { key: 'classic', name: 'Classic blue', description: 'The platform’s original blue look.', radius: 'default', font: 'plex', light: classicLight, dark: classicDark },
];
export const DEFAULT_DESIGN_KEY = 'oneteam-flow';
export const builtInDesign = (key: string): DesignTheme | undefined => BUILT_IN_DESIGNS.find((d) => d.key === key);
export const FALLBACK_DESIGN: DesignTheme = BUILT_IN_DESIGNS[0]!;

// ---------------------------------------------------------------- validation

/** Text must reach 4.5:1 (WCAG AA); borders and chart colours 3:1. A failing text pair blocks saving, a failing graphic one only warns. */
const TEXT_PAIRS: readonly (readonly [DesignTokenKey, DesignTokenKey])[] = [
  ['textPrimary', 'backgroundApp'], ['textPrimary', 'surfaceCard'], ['textSecondary', 'surfaceCard'], ['textMuted', 'surfaceCard'],
  ['textLink', 'surfaceCard'], ['textLink', 'backgroundApp'], ['textInverse', 'actionSecondary'],
  ['actionPrimaryText', 'actionPrimary'], ['actionPrimaryText', 'actionPrimaryHover'], ['actionSecondaryText', 'actionSecondary'],
  ['selectionForeground', 'selectionBackground'], ['sidebarText', 'sidebarBackground'], ['sidebarActiveText', 'sidebarActive'],
  ['success', 'successSoft'], ['warning', 'warningSoft'], ['danger', 'dangerSoft'], ['info', 'infoSoft'],
];
const GRAPHIC_PAIRS: readonly (readonly [DesignTokenKey, DesignTokenKey])[] = [
  ['borderFocus', 'surfaceCard'], ['chartPrimary', 'surfaceCard'], ['sidebarMuted', 'sidebarBackground'], ['sidebarIndicator', 'sidebarBackground'],
];
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_GRAPHIC_CONTRAST = 3;

export interface DesignIssue {
  mode: 'light' | 'dark' | 'theme';
  /** The token (or `name`, `radius`, …) the problem is about. */
  token: string;
  rule: 'hex' | 'missing' | 'name' | 'description' | 'radius' | 'font' | 'contrast';
  /** For `contrast`: the other token and the ratios. */
  against?: string;
  ratio?: number;
  min?: number;
  severity: 'error' | 'warning';
}

export type DesignValidation = { ok: true; value: DesignDefinition; warnings: DesignIssue[] } | { ok: false; issues: DesignIssue[]; warnings: DesignIssue[] };

const plainText = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/[<>\n\r]/.test(s);

/** Checks a complete theme (every token in both modes). Hex colours are normalized to upper case. */
export function validateDesign(input: unknown): DesignValidation {
  const d = (input ?? {}) as Partial<Record<keyof DesignDefinition, unknown>>;
  const issues: DesignIssue[] = [];
  const warnings: DesignIssue[] = [];
  if (!plainText(d.name, DESIGN_LIMITS.name)) issues.push({ mode: 'theme', token: 'name', rule: 'name', severity: 'error' });
  const description = typeof d.description === 'string' ? d.description.trim() : '';
  if (description.length > DESIGN_LIMITS.description || /[<>]/.test(description)) issues.push({ mode: 'theme', token: 'description', rule: 'description', severity: 'error' });
  if (!(DESIGN_RADII as readonly unknown[]).includes(d.radius)) issues.push({ mode: 'theme', token: 'radius', rule: 'radius', severity: 'error' });
  if (!(DESIGN_FONTS as readonly unknown[]).includes(d.font)) issues.push({ mode: 'theme', token: 'font', rule: 'font', severity: 'error' });

  const modes = {} as Record<'light' | 'dark', DesignTokens>;
  for (const mode of ['light', 'dark'] as const) {
    const given = (d[mode] ?? {}) as Record<string, unknown>;
    const out = {} as DesignTokens;
    for (const key of DESIGN_TOKEN_KEYS) {
      const v = given[key];
      if (v === undefined) issues.push({ mode, token: key, rule: 'missing', severity: 'error' });
      else if (!isHexColor(v)) issues.push({ mode, token: key, rule: 'hex', severity: 'error' });
      else out[key] = v.toUpperCase();
    }
    modes[mode] = out;
  }
  for (const mode of ['light', 'dark'] as const) {
    const t = modes[mode];
    const check = (pairs: typeof TEXT_PAIRS, min: number, severity: 'error' | 'warning') => {
      for (const [fg, bg] of pairs) {
        if (!t[fg] || !t[bg]) continue;
        const ratio = contrast(t[fg], t[bg]);
        if (ratio < min) (severity === 'error' ? issues : warnings).push({ mode, token: fg, against: bg, rule: 'contrast', ratio: Math.round(ratio * 100) / 100, min, severity });
      }
    };
    check(TEXT_PAIRS, MIN_TEXT_CONTRAST, 'error');
    check(GRAPHIC_PAIRS, MIN_GRAPHIC_CONTRAST, 'warning');
  }
  if (issues.length) return { ok: false, issues, warnings };
  return { ok: true, warnings, value: { name: (d.name as string).trim(), description, radius: d.radius as DesignRadius, font: d.font as DesignFont, light: modes.light, dark: modes.dark } };
}

/** Applies a partial change on top of an existing definition: only the tokens named are replaced. */
export function mergeDesign(base: DesignDefinition, patch: { name?: string; description?: string; radius?: string; font?: string; light?: Partial<Record<string, string>>; dark?: Partial<Record<string, string>> }): unknown {
  return {
    name: patch.name ?? base.name,
    description: patch.description ?? base.description,
    radius: patch.radius ?? base.radius,
    font: patch.font ?? base.font,
    light: { ...base.light, ...(patch.light ?? {}) },
    dark: { ...base.dark, ...(patch.dark ?? {}) },
  };
}

export const slugifyDesignKey = (name: string): string => {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return DESIGN_KEY.test(s) ? s : `design-${s || 'x'}`.slice(0, 40);
};

// ---------------------------------------------------------------- CSS variables

/** token → CSS custom property used by the web app's stylesheet. */
export const DESIGN_CSS_VARS: Record<DesignTokenKey, string> = {
  backgroundApp: '--bg', backgroundSubtle: '--surface-2', surfaceCard: '--surface', surfaceRaised: '--surface-raised', surfaceSunken: '--surface-sunken', surfaceBrand: '--brand', surfaceBrandSoft: '--brand-soft', surfaceAccent: '--accent-soft',
  textPrimary: '--ink', textSecondary: '--ink-2', textMuted: '--muted', textPlaceholder: '--placeholder', textInverse: '--ink-inverse', textLink: '--link',
  borderDefault: '--line', borderStrong: '--line-strong', borderFocus: '--focus',
  actionPrimary: '--accent', actionPrimaryHover: '--accent-hover', actionPrimaryText: '--accent-ink', actionSecondary: '--action-2', actionSecondaryHover: '--action-2-hover', actionSecondaryText: '--action-2-ink',
  selectionBackground: '--selection', selectionForeground: '--selection-fg', selectionLine: '--selection-line',
  progressTrack: '--track', progressFill: '--fill', chartPrimary: '--chart-1', chartSecondary: '--chart-2', chartHighlight: '--chart-3',
  success: '--ok', successSoft: '--ok-soft', successLine: '--ok-line', warning: '--warn', warningSoft: '--warn-soft', warningLine: '--warn-line',
  danger: '--danger', dangerSoft: '--danger-soft', dangerLine: '--danger-line', info: '--info', infoSoft: '--info-soft', infoLine: '--info-line',
  sidebarBackground: '--sidebar-bg', sidebarText: '--sidebar-ink', sidebarMuted: '--sidebar-muted', sidebarHover: '--sidebar-hover', sidebarActive: '--sidebar-active', sidebarActiveText: '--sidebar-active-ink', sidebarIndicator: '--sidebar-indicator',
};

const RADIUS: Record<DesignRadius, [string, string, string]> = { sharp: ['2px', '4px', '8px'], default: ['6px', '10px', '16px'], round: ['10px', '16px', '24px'] };
const FONT_STACK: Record<DesignFont, string> = {
  plex: "'IBM Plex Sans', 'IBM Plex Sans Arabic', ui-sans-serif, system-ui, sans-serif",
  jakarta: "'Plus Jakarta Sans', 'IBM Plex Sans Arabic', ui-sans-serif, system-ui, sans-serif",
};

export interface DesignCss {
  light: Record<string, string>;
  dark: Record<string, string>;
  /** Shared by both modes (corner radii, typeface). */
  common: Record<string, string>;
}

/** The custom properties for a theme. Values are validated hex colours, fixed sizes and fixed font stacks: nothing free-form reaches CSS. */
export function designCss(theme: Pick<DesignDefinition, 'light' | 'dark' | 'radius' | 'font'>): DesignCss {
  const vars = (t: DesignTokens) => Object.fromEntries(DESIGN_TOKEN_KEYS.map((k) => [DESIGN_CSS_VARS[k], t[k]]));
  const [sm, md, lg] = RADIUS[theme.radius];
  return { light: vars(theme.light), dark: vars(theme.dark), common: { '--r-sm': sm, '--r': md, '--r-lg': lg, '--font-sans': FONT_STACK[theme.font] } };
}

/** A theme received from the server or a local cache: re-validated, or null. Warnings never block display. */
export function parseDesignTheme(input: unknown): DesignTheme | null {
  const key = (input as { key?: unknown } | null)?.key;
  if (typeof key !== 'string' || !DESIGN_KEY.test(key)) return null;
  const r = validateDesign(input);
  return r.ok ? { key, ...r.value } : null;
}

/**
 * Which design someone sees: their own choice, else their organization's, else the platform default. A person's choice
 * is set aside while the organization has switched personal choice off (`personalAllowed: false`).
 */
export function resolveDesign(input: { platform: DesignTheme; org?: DesignTheme | null; personal?: DesignTheme | null; personalAllowed?: boolean }): DesignTheme {
  return (input.personalAllowed !== false && input.personal) || input.org || input.platform;
}
