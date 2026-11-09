'use client';

import { ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { AuditRows } from '@/features/org/audit-rows';

export function AdminAudit() {
  const t = useTranslations('admin.audit');
  const [action, setAction] = useState('');
  const debounced = useDebounced(action.trim());
  const list = useCursorList(['admin', 'audit', debounced], (cursor) => api.admin.audit({ action: debounced || undefined, cursor, limit: 25 }));
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card className="anim-rise">
        <div className="border-b border-line p-4">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('filterPlaceholder')} aria-label={t('filter')} dir="ltr" className="max-w-xs text-start" />
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={ScrollText} title={t('empty')} />}
        {list.items.length > 0 && <AuditRows entries={list.items} showOrg />}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
    </>
  );
}
