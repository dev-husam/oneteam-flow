import { MESSAGES, type Locale } from '@pt/i18n';
import { IntlMessageFormat } from 'intl-messageformat';

type Tree = { [key: string]: string | Tree };
const cache = new Map<string, IntlMessageFormat>();

function lookup(locale: Locale, path: string): string | undefined {
  let node: string | Tree | undefined = MESSAGES[locale] as unknown as Tree;
  for (const part of path.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

function format(locale: Locale, raw: string, params: Record<string, string> | undefined): string {
  if (!raw.includes('{')) return raw;
  const id = `${locale}|${raw}`;
  let fmt = cache.get(id);
  if (!fmt) cache.set(id, (fmt = new IntlMessageFormat(raw, locale)));
  return String(fmt.format(params));
}

/** Title and body of a notification in the recipient's language (same ICU messages as web and mobile). */
export function renderNotification(type: string, locale: Locale, params?: Record<string, string>): { title: string; body: string } {
  const key = `notifications.${type.replaceAll('.', '_')}`;
  const title = lookup(locale, `${key}.title`) ?? lookup('en', `${key}.title`) ?? type;
  const body = lookup(locale, `${key}.body`) ?? lookup('en', `${key}.body`) ?? '';
  return { title: format(locale, title, params), body: format(locale, body, params) };
}

export const asLocale = (value: string | null | undefined): Locale => (value === 'ar' ? 'ar' : 'en');
