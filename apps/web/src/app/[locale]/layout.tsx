import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DIRECTIONS, LOCALES } from '@pt/i18n';
import { THEME_INIT_SCRIPT } from '@/components/shell/theme-provider';
import { routing } from '@/i18n/routing';
import { BrandProvider } from '@/components/brand/brand-provider';
import { BrandStyle } from '@/components/brand/brand-style';
import { localeOf } from '@/lib/locale';
import { loadPublicConfig } from '@/lib/public-config';
import { AppProviders } from '@/providers/app-providers';
import '@/styles/globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeOf(params);
  const { identity } = await loadPublicConfig();
  return { title: { default: identity.appName[locale], template: `%s · ${identity.appName[locale]}` }, description: identity.tagline[locale] };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const config = await loadPublicConfig();

  return (
    <html lang={locale} dir={DIRECTIONS[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <BrandStyle design={config.design} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <BrandProvider config={config}>
            <AppProviders>{children}</AppProviders>
          </BrandProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
