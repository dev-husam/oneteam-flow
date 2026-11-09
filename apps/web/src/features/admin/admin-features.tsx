'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminFeatureFlag, AdminOrgFeatureFlag } from '@pt/api-client';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';

const GROUP_ORDER = ['access', 'collaboration', 'fitness', 'notifications', 'administration'];
type Names = 'registration' | 'organization_creation' | 'messaging' | 'custom_roles' | 'progress_photos' | 'reminders' | 'push_notifications' | 'email_notifications';
type Groups = 'access' | 'collaboration' | 'fitness' | 'notifications' | 'administration';

/** Platform-wide feature switches. Turning one off closes the feature for everyone, except organizations with an override. */
export function AdminFeatures() {
  const t = useTranslations('adminConfig');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api.admin.flags.list() });
  const set = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => api.admin.flags.set(key, enabled),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] }); toast(t('saved')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const byGroup = GROUP_ORDER.map((g) => ({ group: g, items: (flags.data ?? []).filter((f) => f.group === g) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader title={t('features.title')} description={t('features.subtitle')} />
      {flags.isPending && <Skeleton className="h-64" />}
      {flags.isError && <ErrorAlert error={flags.error} />}
      <div className="space-y-5">
        {byGroup.map(({ group, items }) => (
          <Card key={group} className="anim-rise">
            <CardHeader><CardTitle>{t(`features.groups.${group as Groups}`)}</CardTitle></CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {items.map((f) => <FlagRow key={f.key} flag={f} onChange={(enabled) => set.mutate({ key: f.key, enabled })} pending={set.isPending} />)}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

function FlagRow({ flag, onChange, pending }: { flag: AdminFeatureFlag; onChange: (enabled: boolean) => void; pending: boolean }) {
  const t = useTranslations('adminConfig.features');
  const name = t(`names.${flag.key as Names}`);
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {name}
          <Badge tone="neutral">{flag.scope === 'PLATFORM' ? t('scopePlatform') : t('scopeOrganization')}</Badge>
        </p>
        <p className="text-sm text-muted">{flag.description}</p>
        {flag.scope === 'ORGANIZATION' && <p className="text-xs text-muted">{t('overrides', { count: flag.overrideCount })}</p>}
      </div>
      <Badge tone={flag.enabled ? 'ok' : 'neutral'}>{flag.enabled ? t('on') : t('off')}</Badge>
      {flag.enabled
        ? <ConfirmButton size="sm" confirmLabel={t('confirmOff')} disabled={pending} onConfirm={() => onChange(false)}>{t('turnOff')}</ConfirmButton>
        : <Button size="sm" variant="secondary" disabled={pending} onClick={() => onChange(true)}>{t('turnOn')}</Button>}
    </li>
  );
}

/** Per-organization exceptions, shown on the organization page in the admin console. */
export function OrganizationFeatures({ orgId }: { orgId: string }) {
  const t = useTranslations('adminConfig.features');
  const tc = useTranslations('adminConfig');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: ['admin', 'org-flags', orgId], queryFn: () => api.admin.flags.forOrganization(orgId) });
  const set = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean | null }) => api.admin.flags.setForOrganization(orgId, key, enabled),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(tc('saved')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const value = (f: AdminOrgFeatureFlag) => (f.override === null ? 'follow' : f.override ? 'on' : 'off');
  return (
    <Card className="anim-rise lg:col-span-2" style={{ ['--i' as string]: 2 }}>
      <CardHeader><CardTitle>{t('orgTitle')}</CardTitle><p className="text-xs text-muted">{t('orgHint')}</p></CardHeader>
      <CardBody className="p-0">
        {flags.isPending && <div className="p-4"><Skeleton className="h-24" /></div>}
        {flags.isError && <div className="p-4"><ErrorAlert error={flags.error} /></div>}
        <ul className="divide-y divide-line">
          {flags.data?.map((f) => {
            const name = t(`names.${f.key as Names}`);
            return (
              <li key={f.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name}</p>
                  <p className="text-xs text-muted">{t('platformValue', { value: f.platformEnabled ? t('on') : t('off') })} · {t('effective', { value: f.effective ? t('on') : t('off') })}</p>
                </div>
                <Select
                  aria-label={name}
                  className="h-9 w-44"
                  value={value(f)}
                  disabled={set.isPending}
                  onChange={(e) => set.mutate({ key: f.key, enabled: e.target.value === 'follow' ? null : e.target.value === 'on' })}
                >
                  <option value="follow">{t('follow')}</option>
                  <option value="on">{t('forceOn')}</option>
                  <option value="off">{t('forceOff')}</option>
                </Select>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
