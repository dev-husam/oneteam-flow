'use client';

import { Activity, ShieldCheck, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { useBrand } from '@/components/brand/brand-provider';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

const POINTS = [
  { icon: Activity, key: 'point1' },
  { icon: ShieldCheck, key: 'point2' },
  { icon: Smartphone, key: 'point3' },
] as const;

/** Split-screen "front door": brand panel on one side, form on the other. */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const brand = useBrand();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -start-24 -top-24 size-[26rem] animate-[drift_14s_ease-in-out_infinite] rounded-full bg-chart-2/40 blur-3xl" />
          <div className="absolute -bottom-32 end-0 size-[30rem] animate-[drift_18s_ease-in-out_infinite_reverse] rounded-full bg-chart-1/40 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>

        <div className="relative flex items-center gap-3">
          <BrandLogo className="size-9" />
          <span className="text-lg font-semibold tracking-tight">{brand.appName}</span>
        </div>

        <div className="relative max-w-md space-y-10">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">{brand.tagline}</h2>
          <ul className="space-y-6">
            {POINTS.map(({ icon: Icon, key }, i) => (
              <li key={key} className="anim-rise flex gap-4" style={{ ['--i' as string]: i + 2 }}>
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{t(`auth.brand.${key}Title`)}</p>
                  <p className="text-sm text-white/65">{t(`auth.brand.${key}Body`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} {brand.appName}</p>
      </aside>

      <main className="relative flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 lg:invisible">
            <BrandLogo className="size-7" />
            <span className="font-semibold">{brand.appName}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="anim-rise w-full max-w-md rounded-lg border border-line bg-surface/90 p-6 shadow-lg backdrop-blur sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
