'use client';

import { Building2, ChevronRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useBrand } from '@/components/brand/brand-provider';
import { useMyOrganizations, useRoleLabel } from '@/lib/org/org-context';

/** The organizations the signed-in user belongs to: the entry point into every organization workspace. */
export function OrganizationsCard() {
  const t = useTranslations('orgs');
  const roleLabel = useRoleLabel();
  const mine = useMyOrganizations();
  const { organizationCreationOpen } = useBrand();

  return (
    <Card className="anim-rise" style={{ ['--i' as string]: 3 }}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('yours')}</CardTitle>
        {mine.data?.length === 0 && organizationCreationOpen && (
          <Link href="/organizations/new" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            <Plus className="size-4" aria-hidden /> {t('create')}
          </Link>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {mine.isPending && (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {mine.isError && (
          <div className="p-4">
            <ErrorAlert error={mine.error} />
          </div>
        )}
        {mine.data?.length === 0 && (
          <EmptyState icon={Building2} title={t('emptyTitle')}>
            {t('emptyBody')}
          </EmptyState>
        )}
        {mine.data && mine.data.length > 0 && (
          <ul className="divide-y divide-line">
            {mine.data.map((m) => (
              <li key={m.organization.id}>
                <Link href={`/o/${m.organization.slug}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-selection font-semibold text-link">{m.organization.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.organization.name}</span>
                    <span className="block truncate text-sm text-muted">{roleLabel(m.role)}</span>
                  </span>
                  {m.organization.status !== 'ACTIVE' && <Badge tone="warn">{t('suspended')}</Badge>}
                  <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
