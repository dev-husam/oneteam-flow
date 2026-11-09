import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_DESIGNS, contrast, resolveDesign, DESIGN_CSS_VARS, DESIGN_TOKEN_GROUPS, DESIGN_TOKEN_KEYS, designCss, mergeDesign, parseDesignTheme, slugifyDesignKey, validateDesign,
} from './design.js';

const oneteam = BUILT_IN_DESIGNS[0]!;

describe('built-in designs', () => {
  it('every built-in theme is complete and passes its own accessibility rules in both modes', () => {
    expect(BUILT_IN_DESIGNS.map((d) => d.key)).toEqual(['oneteam-flow', 'classic']);
    for (const d of BUILT_IN_DESIGNS) {
      const r = validateDesign(d);
      expect(r.ok, `${d.key}: ${JSON.stringify(r.ok ? [] : r.issues)}`).toBe(true);
    }
  });
  it('OneTeam Flow follows the specification: orange action with navy text, navy sidebar, blue selection', () => {
    expect(oneteam.light).toMatchObject({ actionPrimary: '#FF6A2B', actionPrimaryText: '#0D1A33', actionSecondary: '#0D1A33', sidebarBackground: '#0D1A33', selectionBackground: '#E8F0FA', textLink: '#25436B' });
    expect(oneteam.dark).toMatchObject({ backgroundApp: '#081326', surfaceCard: '#12213D', textLink: '#8FB4E3', actionSecondary: '#8FB4E3' });
    expect(contrast('#0D1A33', '#FF6A2B')).toBeGreaterThanOrEqual(4.5); // the specification's rule: navy text on orange, never white
    expect(contrast('#FFFFFF', '#FF6A2B')).toBeLessThan(4.5);
  });
  it('every token has a CSS variable and every variable name is unique', () => {
    expect(Object.keys(DESIGN_CSS_VARS).sort()).toEqual([...DESIGN_TOKEN_KEYS].sort());
    expect(new Set(Object.values(DESIGN_CSS_VARS)).size).toBe(DESIGN_TOKEN_KEYS.length);
    expect(Object.values(DESIGN_TOKEN_GROUPS).flat()).toHaveLength(DESIGN_TOKEN_KEYS.length);
  });
});

describe('validateDesign', () => {
  it('rejects missing tokens, malformed colours, bad names and unknown styles', () => {
    const light = { ...oneteam.light } as Record<string, string>;
    delete light.textMuted;
    light.surfaceCard = 'white';
    const r = validateDesign({ ...oneteam, name: '<b>x</b>', radius: 'pill', font: 'comic', light });
    expect(r).toMatchObject({ ok: false });
    const issues = r.ok ? [] : r.issues;
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ token: 'textMuted', rule: 'missing', mode: 'light' }),
      expect.objectContaining({ token: 'surfaceCard', rule: 'hex' }),
      expect.objectContaining({ token: 'name', rule: 'name' }),
      expect.objectContaining({ token: 'radius' }), expect.objectContaining({ token: 'font' }),
    ]));
  });
  it('rejects text that is hard to read, saying which pair and by how much; graphics only warn', () => {
    const r = validateDesign({ ...oneteam, light: { ...oneteam.light, actionPrimaryText: '#FFFFFF', chartPrimary: '#F1F5F9' } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toContainEqual(expect.objectContaining({ mode: 'light', token: 'actionPrimaryText', against: 'actionPrimary', rule: 'contrast', min: 4.5 }));
      expect(r.warnings).toContainEqual(expect.objectContaining({ token: 'chartPrimary', rule: 'contrast', severity: 'warning' }));
    }
    const onlyGraphic = validateDesign({ ...oneteam, light: { ...oneteam.light, chartPrimary: '#F1F5F9' } });
    expect(onlyGraphic.ok).toBe(true);
    expect(onlyGraphic.warnings.length).toBe(1);
  });
  it('normalizes colours to upper case and trims the name', () => {
    const r = validateDesign({ ...oneteam, name: '  Sea  ', light: { ...oneteam.light, textLink: '#25436b' } });
    expect(r.ok && r.value.light.textLink).toBe('#25436B');
    expect(r.ok && r.value.name).toBe('Sea');
  });
  it('mergeDesign changes only the tokens named', () => {
    const merged = mergeDesign(oneteam, { name: 'Mine', light: { actionPrimary: '#E65318' } }) as typeof oneteam;
    expect(merged.name).toBe('Mine');
    expect(merged.light.actionPrimary).toBe('#E65318');
    expect(merged.light.textPrimary).toBe(oneteam.light.textPrimary);
    expect(merged.dark).toEqual(oneteam.dark);
  });
  it('slugs are valid keys', () => {
    expect(slugifyDesignKey('Sea Breeze 2')).toBe('sea-breeze-2');
    expect(slugifyDesignKey('!!!')).toMatch(/^[a-z][a-z0-9-]{1,39}$/);
    expect(slugifyDesignKey('نمط')).toMatch(/^[a-z][a-z0-9-]{1,39}$/);
  });
});

describe('CSS output and parsing', () => {
  it('emits only hex colours, fixed radii and fixed font stacks', () => {
    const css = designCss(oneteam);
    expect(css.light['--accent']).toBe('#FF6A2B');
    expect(css.dark['--link']).toBe('#8FB4E3');
    expect(css.common['--r']).toBe('10px');
    expect(css.common['--font-sans']).toContain('Plus Jakarta Sans');
    for (const v of [...Object.values(css.light), ...Object.values(css.dark)]) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('parseDesignTheme accepts a good theme and refuses a damaged one', () => {
    expect(parseDesignTheme(oneteam)?.key).toBe('oneteam-flow');
    expect(parseDesignTheme({ ...oneteam, key: '../x' })).toBeNull();
    expect(parseDesignTheme({ ...oneteam, dark: {} })).toBeNull();
    expect(parseDesignTheme(null)).toBeNull();
  });
});

describe('which design someone sees', () => {
  const [platform, classic] = BUILT_IN_DESIGNS as [typeof oneteam, typeof oneteam];
  const orgDesign = { ...classic, key: 'org-look' };
  it('a personal choice beats the organization’s design, which beats the platform default', () => {
    expect(resolveDesign({ platform }).key).toBe('oneteam-flow');
    expect(resolveDesign({ platform, org: orgDesign }).key).toBe('org-look');
    expect(resolveDesign({ platform, org: orgDesign, personal: classic }).key).toBe('classic');
    expect(resolveDesign({ platform, personal: classic }).key).toBe('classic');
  });
  it('an organization that switched personal choice off always shows its own design', () => {
    expect(resolveDesign({ platform, org: orgDesign, personal: classic, personalAllowed: false }).key).toBe('org-look');
    expect(resolveDesign({ platform, personal: classic, personalAllowed: false }).key).toBe('oneteam-flow');
    expect(resolveDesign({ platform, org: null, personal: null }).key).toBe('oneteam-flow');
  });
});
