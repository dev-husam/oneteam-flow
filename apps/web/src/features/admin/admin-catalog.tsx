'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogEntry } from '@pt/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';

function CatalogList({ title, hint, queryKey, load, setStatus }: {
  title: string; hint: string; queryKey: string[]; load: () => Promise<CatalogEntry[]>; setStatus: (key: string, status: CatalogEntry['status']) => Promise<unknown>;
}) {
  const t = useTranslations('admin.catalog');
  const locale = useLocale() as 'en' | 'ar';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey, queryFn: load });
  const toggle = useMutation({
    mutationFn: ({ key, status }: { key: string; status: CatalogEntry['status'] }) => setStatus(key, status),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(t('updated')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{title}</CardTitle><p className="text-xs text-muted">{hint}</p></CardHeader>
      <CardBody className="p-0">
        {list.isPending && <div className="p-4"><Skeleton className="h-20" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        <ul className="divide-y divide-line">
          {list.data?.map((e) => (
            <li key={e.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.nameI18n[locale]}</p>
                <p className="ltr-isolate text-xs text-muted">{e.key} · {t('inUse', { count: e._count.organizations })}</p>
              </div>
              <StatusBadge status={e.status} />
              {e.status === 'ENABLED'
                ? <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => toggle.mutateAsync({ key: e.key, status: 'DISABLED' })}>{t('disable')}</ConfirmButton>
                : <Button size="sm" variant="secondary" onClick={() => toggle.mutate({ key: e.key, status: 'ENABLED' })}>{t('enable')}</Button>}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function AdminCatalog() {
  const t = useTranslations('admin.catalog');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <CatalogList title={t('categories')} hint={t('categoriesHint')} queryKey={['admin', 'categories']} load={() => api.admin.categories.list()} setStatus={(k, s) => api.admin.categories.setStatus(k, s)} />
        <CatalogList title={t('modules')} hint={t('modulesHint')} queryKey={['admin', 'modules']} load={() => api.admin.modules.list()} setStatus={(k, s) => api.admin.modules.setStatus(k, s)} />
      </div>
    </>
  );
}
