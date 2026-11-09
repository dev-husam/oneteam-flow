'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, type Locale } from '@pt/i18n';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div role="radiogroup" aria-label={t('label')} className={cn('inline-flex rounded-md border border-line bg-surface p-0.5', className)}>
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={locale === code}
          lang={code}
          onClick={() => router.replace(pathname, { locale: code })}
          className={cn(
            'h-7 rounded-sm px-2.5 text-xs font-medium transition-colors',
            locale === code ? 'bg-selection text-link' : 'text-muted hover:text-ink',
          )}
        >
          {t(code)}
        </button>
      ))}
    </div>
  );
}
