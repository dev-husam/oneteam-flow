'use client';

import type { AuditEntry } from '@pt/api-client';
import { useFormatter, useTranslations } from 'next-intl';

/** Human wording for an audit action; unknown actions (future modules) show their code. */
export function useAuditLabel() {
  const t = useTranslations('audit.actions');
  return (action: string): string => {
    const key = action.replaceAll('.', '_') as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : action;
  };
}

export function AuditRows({ entries, showOrg }: { entries: AuditEntry[]; showOrg?: boolean }) {
  const t = useTranslations('audit');
  const format = useFormatter();
  const label = useAuditLabel();
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
          <span className="font-medium">{label(e.action)}</span>
          <span className="text-sm text-muted">
            {e.actorName ?? (e.actorType === 'SYSTEM' ? t('system') : e.actorUserId ? t('someone') : t('system'))}
            {e.actorType === 'SUPER_ADMIN' && ` · ${t('platformStaff')}`}
          </span>
          {showOrg && e.organizationId && <span className="ltr-isolate text-xs text-muted">{e.organizationId.slice(0, 8)}</span>}
          <span className="ms-auto text-xs text-muted" title={e.createdAt}>
            {format.dateTime(new Date(e.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </li>
      ))}
    </ul>
  );
}
