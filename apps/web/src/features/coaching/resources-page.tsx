'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { coachingKey, ResourceDialog, ResourceItem, useClientsOptions } from './shared';

/** Everything the coach has shared, with a way to share more. */
export function ResourcesPage() {
  const t = useTranslations('coaching.resources');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [sharing, setSharing] = useState(false);
  const { clients } = useClientsOptions();
  const list = useQuery({ queryKey: coachingKey(orgId, 'resources', 'all'), queryFn: () => api.org(orgId).coaching.resources.list() });
  const archive = useMutation({ mutationFn: (id: string) => api.org(orgId).coaching.resources.archive(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastArchived')); }, onError: (e) => toast(errorMessage(e), 'error') });
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button onClick={() => setSharing(true)}><Plus className="size-4" aria-hidden /> {t('new')}</Button>} />
      <Card className="anim-rise">
        <CardBody className="p-0">
          {list.isPending && <div className="p-4"><Skeleton className="h-16" /></div>}
          {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
          {list.data?.length === 0 && <EmptyState icon={FolderOpen} title={t('empty')}>{t('emptyBody')}</EmptyState>}
          <ul className="divide-y divide-line">{list.data?.map((r) => <ResourceItem key={r.id} resource={r} onArchive={() => archive.mutate(r.id)} />)}</ul>
        </CardBody>
      </Card>
      {sharing && <ResourceDialog open onClose={() => setSharing(false)} clients={clients} />}
    </>
  );
}
