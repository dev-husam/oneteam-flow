import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import type { Locale } from '@pt/i18n';
import { routing } from '@/i18n/routing';

/** Narrows the `[locale]` route param to a supported locale, or renders the 404 page. */
export async function localeOf(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}
