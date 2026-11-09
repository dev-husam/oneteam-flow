import { MESSAGES, DIRECTIONS, type Locale } from '@pt/i18n';
import { IntlMessageFormat } from 'intl-messageformat';
import { I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';

type Tree = { [key: string]: string | Tree };
export type Vars = Record<string, string | number>;

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

const cache = new Map<string, IntlMessageFormat>();

export interface Translator {
  (key: string, vars?: Vars): string;
  has: (key: string) => boolean;
  locale: Locale;
}

/** Same ICU messages as the web app (@pt/i18n): plurals, placeholders and Arabic's six plural forms included. */
export function createTranslator(locale: Locale): Translator {
  const tree = MESSAGES[locale] as unknown as Tree;
  const fallback = MESSAGES.en as unknown as Tree;
  const t = ((key: string, vars?: Vars) => {
    const raw = lookup(tree, key) ?? lookup(fallback, key) ?? key;
    if (!vars && !raw.includes('{')) return raw;
    const id = `${locale}|${raw}`;
    let fmt = cache.get(id);
    if (!fmt) {
      fmt = new IntlMessageFormat(raw, locale);
      cache.set(id, fmt);
    }
    return String(fmt.format(vars));
  }) as Translator;
  t.has = (key) => lookup(tree, key) !== undefined;
  t.locale = locale;
  return t;
}

export const isRtl = (locale: Locale): boolean => DIRECTIONS[locale] === 'rtl';

export function deviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
}

/**
 * React Native fixes the layout direction at app start. Returns true when the direction was changed and the app
 * must be restarted before mirrored layouts apply.
 */
export function applyDirection(locale: Locale): boolean {
  const rtl = isRtl(locale);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}
