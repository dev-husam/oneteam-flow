'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ADMIN_NAV } from '@/config/admin-navigation';
import { Shell } from './shell';

/** Frame for /admin: visually and structurally separate from organization screens. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.nav');
  const items = ADMIN_NAV.map(({ key, href, icon }) => ({ key, href, icon, label: t(key), exact: key === 'overview' }));
  return (
    <Shell items={items} areaLabel={t('area')}>
      {children}
    </Shell>
  );
}
