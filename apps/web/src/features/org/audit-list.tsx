'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { AuditRows } from './audit-rows';

/** Organization audit trail. `compact` is the short list on the overview page. */
export function AuditList({ limit = 25, compact = false }: { limit?: number; compact?: boolean }) {
  const t = useTranslations('audit');
  const { orgId } = useOrg();
  const [action, setAction] = useState('');
  const debounced = useDebounced(action.trim());
  const list = useCursorList(orgKey(orgId, 'audit', debounced, limit), (cursor) => api.org(orgId).audit({ action: debounced || undefined, cursor, limit }));

  return (
    <div>
      {!compact && (
        <div className="border-b border-line p-4">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('filterPlaceholder')} aria-label={t('filter')} dir="ltr" className="max-w-xs text-start" />
        </div>
      )}
      {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
      {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
      {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={ScrollText} title={t('empty')} />}
      {list.items.length > 0 && <AuditRows entries={list.items} />}
      {!compact && <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />}
    </div>
  );
}
