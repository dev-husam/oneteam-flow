'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useTheme, type ThemePreference } from './theme-provider';

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'system', icon: Monitor },
  { value: 'dark', icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const { preference, setPreference } = useTheme();

  return (
    <div role="radiogroup" aria-label={t('label')} className={cn('inline-flex rounded-md border border-line bg-surface p-0.5', className)}>
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={t(value)}
          title={t(value)}
          onClick={() => setPreference(value)}
          className={cn(
            'grid size-7 place-items-center rounded-sm transition-colors',
            preference === value ? 'bg-selection text-link' : 'text-muted hover:text-ink',
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
