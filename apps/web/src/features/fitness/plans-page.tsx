'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';

function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('fitness');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orgId, slug } = useOrg();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.create({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: async (plan) => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'plans') }); router.push(`/o/${slug}/plans/${plan.id}`); },
  });
  return (
    <Dialog open onClose={onClose} title={t('plans.createTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.isError && <ErrorAlert error={create.error} />}
        <Field label={t('plans.name')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />}</Field>
        <Field label={t('plans.description')} optionalLabel={t('optional')}>{(c) => <Input {...c} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />}</Field>
        <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2} className="w-full">{t('plans.create')}</Button>
      </form>
    </Dialog>
  );
}

export function PlansPage() {
  const t = useTranslations('fitness');
  const format = useFormatter();
  const { orgId, slug } = useOrg();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const search = useDebounced(q.trim());
  const list = useCursorList(orgKey(orgId, 'fitness', 'plans', 'list', search, archived), (cursor) => api.org(orgId).fitness.plans.list({ q: search || undefined, archived: archived || undefined, cursor, limit: 25 }));

  return (
    <>
      <PageHeader title={t('plans.title')} description={t('plans.subtitle')} actions={<Button onClick={() => setCreating(true)}>{t('plans.create')}</Button>} />
      <Card className="anim-rise">
        <div className="flex flex-wrap items-center gap-4 border-b border-line p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('plans.searchPlaceholder')} aria-label={t('plans.search')} className="w-full sm:max-w-xs" />
          <Checkbox label={t('plans.showArchived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={ClipboardList} title={t('plans.empty')}>{t('plans.emptyBody')}</EmptyState>}
        {list.items.length > 0 && (
          <ul className="divide-y divide-line">
            {list.items.map((p) => (
              <li key={p.id}>
                <Link href={`/o/${slug}/plans/${p.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-xs text-muted">{t('plans.updated', { date: format.dateTime(new Date(p.updatedAt), { dateStyle: 'medium' }), name: p.createdByName })}</span>
                  </span>
                  {p.currentVersion ? <Badge tone="ok">{t('plans.versionLive', { n: p.currentVersion.versionNo })}</Badge> : <Badge tone="warn">{t('plans.notPublished')}</Badge>}
                  {p.hasDraft && p.currentVersion && <Badge tone="accent">{t('plans.hasDraft')}</Badge>}
                  {p.archived && <Badge>{t('plans.archivedBadge')}</Badge>}
                  <Badge>{t('plans.assignedCount', { count: p.activeAssignments })}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
      {creating && <CreatePlanDialog onClose={() => setCreating(false)} />}
    </>
  );
}
