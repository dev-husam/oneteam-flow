'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';
import { useErrorMessage } from '@/lib/errors';
import { useDebounced } from '@/lib/use-debounced';

export function AdminRoles() {
  const t = useTranslations('admin.roles');
  const tp = useTranslations('permissions');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const roles = useQuery({ queryKey: ['admin', 'platform-roles'], queryFn: () => api.admin.platformRoles.list() });
  const candidates = useQuery({ queryKey: ['admin', 'role-candidates', search], queryFn: () => api.admin.users.list({ q: search, status: 'ACTIVE', limit: 5 }), enabled: search.length >= 3 });
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(t('updated')); setQ(''); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const holders = new Set(roles.data?.flatMap((r) => r.holders.map((h) => h.id)));

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {roles.isPending && <Skeleton className="h-40" />}
      {roles.isError && <ErrorAlert error={roles.error} />}
      <div className="space-y-5">
        {roles.data?.map((role) => (
          <Card key={role.key} className="anim-rise">
            <CardHeader><CardTitle className="font-mono text-sm">{role.key}</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t('permissions')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => <Badge key={p}>{tp.has(`code.${p.replaceAll('.', '_')}` as 'code.audit_read') ? tp(`code.${p.replaceAll('.', '_')}` as 'code.audit_read') : p}</Badge>)}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t('holders')}</p>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {role.holders.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1"><p className="font-medium">{h.fullName}{h.id === me?.id && <span className="ms-2 text-xs font-normal text-muted">({t('you')})</span>}</p><p className="ltr-isolate text-xs text-muted">{h.email}</p></div>
                      <span className="text-xs text-muted">{format.dateTime(new Date(h.grantedAt), { dateStyle: 'medium' })}</span>
                      {h.id !== me?.id && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => run.mutateAsync(() => api.admin.platformRoles.revoke(h.id))}>{t('revoke')}</ConfirmButton>}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-sm font-medium">{t('grant')}</p>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('grantPlaceholder')} aria-label={t('grant')} className="max-w-sm" />
                {candidates.data && (
                  <ul className="mt-2 max-w-sm divide-y divide-line rounded-md border border-line">
                    {candidates.data.data.length === 0 && <li className="px-4 py-2.5 text-sm text-muted">{t('noCandidates')}</li>}
                    {candidates.data.data.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1"><p className="truncate font-medium">{u.fullName}</p><p className="ltr-isolate truncate text-xs text-muted">{u.email}</p></div>
                        {holders.has(u.id) ? <Badge tone="accent">{t('alreadyHolder')}</Badge> : <ConfirmButton size="sm" variant="secondary" confirmLabel={t('confirmAgain')} onConfirm={() => run.mutateAsync(() => api.admin.platformRoles.grant(u.id))}>{t('makeAdmin')}</ConfirmButton>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted">{t('grantHint')}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
