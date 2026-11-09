'use client';

import { Menu, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { useBrand } from '@/components/brand/brand-provider';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

export interface ShellNavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active only on the exact path (overview pages). */
  exact?: boolean;
  /** A count to show next to the label (e.g. unread messages). Hidden when zero. */
  badge?: number;
}

interface SidebarProps {
  items: ShellNavItem[];
  /** Area label shown under the product name (e.g. "Platform administration"). */
  areaLabel?: string;
  /** Slot between the brand and the navigation: the organization switcher. */
  top?: ReactNode;
  onNavigate?: () => void;
  footer?: ReactNode;
}

function SidebarContent({ items, areaLabel, top, onNavigate, footer }: SidebarProps) {
  const t = useTranslations();
  const brand = useBrand();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <BrandLogo className="size-8" />
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight text-sidebar-active-ink">{brand.appName}</p>
          {areaLabel && <p className="truncate text-[0.7rem] uppercase tracking-wide text-sidebar-muted">{areaLabel}</p>}
        </div>
      </div>
      {top && <div className="px-3 pb-2">{top}</div>}
      <nav aria-label={t('nav.main')} className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map(({ key, href, icon: Icon, label, exact, badge }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={key}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-sidebar-active text-sidebar-active-ink before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-sidebar-indicator' : 'text-sidebar-ink hover:bg-sidebar-hover hover:text-sidebar-active-ink',
              )}
            >
              <Icon className="size-[1.1rem]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span aria-label={t('messaging.unread', { count: badge })} className="rounded-full bg-accent px-1.5 text-[0.7rem] font-semibold leading-5 text-accent-ink tabular-nums">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-4">{footer}</div>}
    </div>
  );
}

/** Responsive application frame: fixed sidebar on large screens, drawer on small ones. */
export function Shell({ items, areaLabel, top, children }: { items: ShellNavItem[]; areaLabel?: string; top?: ReactNode; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  // The drawer is "open for this path": navigating elsewhere closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const drawer = openAt === pathname;
  const setDrawer = (open: boolean) => setOpenAt(open ? pathname : null);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">
        {t('common.skipToContent')}
      </a>

      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[var(--sidebar-w)] bg-sidebar lg:block">
        <SidebarContent items={items} areaLabel={areaLabel} top={top} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="anim-pop absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-sidebar shadow-lg">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label={t('shell.closeMenu')}
              className="absolute end-3 top-4 grid size-8 place-items-center rounded-md text-sidebar-ink hover:bg-sidebar-hover"
            >
              <X className="size-5" />
            </button>
            <SidebarContent
              items={items}
              areaLabel={areaLabel}
              top={top}
              onNavigate={() => setDrawer(false)}
              footer={
                <>
                  <LanguageSwitcher />
                  <ThemeToggle />
                </>
              }
            />
          </aside>
        </div>
      )}

      <div className="lg:ps-[var(--sidebar-w)]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label={t('shell.openMenu')}
            className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="ms-auto flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle className="hidden sm:inline-flex" />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[75rem] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
