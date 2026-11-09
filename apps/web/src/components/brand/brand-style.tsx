import { designCss, type DesignTheme } from '@pt/domain';

const decl = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');

/**
 * A design as CSS custom properties, layered over the defaults in globals.css. The values come from `designCss`, which
 * only ever produces validated hex colours, fixed corner sizes and fixed font stacks, so nothing here can break out of
 * the rule. `id` lets an organization's own design sit after (and so override) the platform's.
 */
export function BrandStyle({ design, id = 'brand-theme' }: { design: Pick<DesignTheme, 'light' | 'dark' | 'radius' | 'font'>; id?: string }) {
  const css = designCss(design);
  const text = `:root{${decl({ ...css.light, ...css.common })}}[data-theme='dark']{${decl(css.dark)}}`;
  return <style id={id} dangerouslySetInnerHTML={{ __html: text }} />;
}
