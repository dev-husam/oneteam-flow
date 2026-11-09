import { BUILT_IN_DESIGNS } from '@pt/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandStyle } from './brand-style';

describe('BrandStyle', () => {
  it('writes the design as CSS variables for light and dark, with its radius and typeface', () => {
    const html = renderToStaticMarkup(<BrandStyle design={BUILT_IN_DESIGNS[0]!} />);
    expect(html).toContain('id="brand-theme"');
    expect(html).toContain(':root{');
    expect(html).toContain('--accent:#FF6A2B');
    expect(html).toContain('--accent-ink:#0D1A33');
    expect(html).toContain("[data-theme='dark']{");
    expect(html).toContain('--link:#8FB4E3');
    expect(html).toContain('--r:10px');
    expect(html).toContain('Plus Jakarta Sans');
  });
  it('an organization’s design gets its own tag so it can follow (and override) the platform’s', () => {
    expect(renderToStaticMarkup(<BrandStyle design={BUILT_IN_DESIGNS[1]!} id="org-design" />)).toContain('id="org-design"');
    expect(renderToStaticMarkup(<BrandStyle design={BUILT_IN_DESIGNS[1]!} />)).toContain("'IBM Plex Sans'");
  });
  it('only validated hex colours and fixed sizes can reach the style element', () => {
    const html = renderToStaticMarkup(<BrandStyle design={BUILT_IN_DESIGNS[0]!} />);
    const values = [...html.matchAll(/--[a-z0-9-]+:([^;}]+)/g)].map((m) => m[1]!);
    for (const v of values) expect(v).toMatch(/^(#[0-9A-F]{6}|\d+px|.*sans-serif)$/);
    expect(html).not.toMatch(/<script|url\(|expression/i);
  });
});
