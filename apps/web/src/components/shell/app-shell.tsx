'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EMPTY_CONTEXT, NAV_ITEMS, visibleNavigation } from '@/config/navigation';
import { Shell } from './shell';

/** Account-level frame (organizations overview, profile, security). */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const items = visibleNavigation(NAV_ITEMS, EMPTY_CONTEXT).map(({ key, href, icon }) => ({ key, href, icon, label: t(key), exact: key === 'dashboard' }));
  return <Shell items={items}>{children}</Shell>;
}
