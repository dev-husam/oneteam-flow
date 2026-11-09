'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionInfo } from '@pt/api-client';
import { Globe, Monitor, Smartphone } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ErrorAlert } from '@/components/shell/error-alert';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';
import { useErrorMessage } from '@/lib/errors';
import { MfaCard } from '@/features/account/mfa-card';

const ICONS = { WEB: Globe, IOS: Smartphone, ANDROID: Smartphone } as const;

function SessionRow({ session, onRevoke, index }: { session: SessionInfo; onRevoke: () => Promise<void>; index: number }) {
  const t = useTranslations('security');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const Icon = ICONS[session.clientType] ?? Monitor;
  const device = session.deviceName ?? t(`client${session.clientType}`);

  return (
    <li className="anim-rise flex flex-wrap items-center gap-3 py-3.5" style={{ ['--i' as string]: index + 1 }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {device}
          {session.current && <Badge tone="accent">{t('thisDevice')}</Badge>}
        </p>
        <p className="text-sm text-muted">
          {t('lastActive', { when: format.relativeTime(new Date(session.lastUsedAt), now) })}
          {session.ip && <span className="ltr-isolate ms-2 inline-block">· {session.ip}</span>}
        </p>
      </div>
      {!session.current && (
        <ConfirmButton size="sm" confirmLabel={t('revokeConfirm')} onConfirm={onRevoke}>
          {t('revoke')}
        </ConfirmButton>
      )}
    </li>
  );
}

export function SecurityPage() {
  const t = useTranslations('security');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { logoutAll } = useAuth();

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.me.sessions() });

  const revoke = useMutation({
    mutationFn: (id: string) => api.me.revokeSession(id),
    onSuccess: async () => {
      toast(t('revoked'));
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const signOutEverywhere = async () => {
    await logoutAll().catch(() => undefined);
    router.replace('/login?reason=signedOut');
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <ConfirmButton size="sm" confirmLabel={t('signOutAllConfirm')} onConfirm={signOutEverywhere}>
            {t('signOutAll')}
          </ConfirmButton>
        }
      />
      <div className="space-y-5">
      <MfaCard />
      <Card className="anim-rise max-w-3xl" style={{ ['--i' as string]: 1 }}>
        <CardHeader>
          <CardTitle>{t('sessions')}</CardTitle>
          <p className="text-xs text-muted">{t('signOutAllHint')}</p>
        </CardHeader>
        <CardBody>
          {sessions.isPending && (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {sessions.isError && <ErrorAlert error={sessions.error} />}
          {sessions.data && sessions.data.length === 0 && <EmptyState icon={Monitor} title={t('empty')} />}
          {sessions.data && sessions.data.length > 0 && (
            <ul className="divide-y divide-line">
              {sessions.data.map((s, i) => (
                <SessionRow key={s.id} session={s} index={i} onRevoke={() => revoke.mutateAsync(s.id)} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      </div>
    </>
  );
}
