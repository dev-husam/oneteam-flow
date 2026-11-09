'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@pt/api-client';
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { usePlatformAccess } from '@/lib/use-platform-access';

export const ADMIN_STATS_KEY = ['admin', 'stats'] as const;

/**
 * Guards /admin. People without a platform role see the same 404 as any unknown page; platform staff whose
 * session is not step-up verified are sent to enable or complete two-factor authentication.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.gate');
  const access = usePlatformAccess();
  const stats = useQuery({
    queryKey: ADMIN_STATS_KEY,
    queryFn: () => api.admin.stats(),
    enabled: access.data?.isPlatformStaff === true,
    retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status < 500),
  });

  if (access.isPending) return <Skeleton className="h-40" />;
  if (access.isError) return <ErrorAlert error={access.error} />;
  if (!access.data.isPlatformStaff) notFound();
  if (stats.isPending) return <Skeleton className="h-40" />;
  if (stats.error instanceof ApiError && stats.error.code === 'MFA_REQUIRED') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t('mfaTitle')}
        action={<Link href="/security" className={buttonVariants()}>{t('mfaAction')}</Link>}
      >
        {t('mfaBody')}
      </EmptyState>
    );
  }
  if (stats.isError) return <ErrorAlert error={stats.error} />;
  return <>{children}</>;
}
