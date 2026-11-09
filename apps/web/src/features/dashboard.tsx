'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Smartphone, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { OrganizationsCard } from '@/features/account/organizations-card';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth/auth-context';
import { useErrorMessage } from '@/lib/errors';
import { useState } from 'react';

function Step({ done, title, body, action, index }: { done: boolean; title: string; body: string; action?: React.ReactNode; index: number }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="anim-rise flex items-start gap-3 py-3.5" style={{ ['--i' as string]: index + 2 }}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${done ? 'text-ok' : 'text-muted'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? 'text-muted line-through' : 'text-ink'}`}>{title}</p>
        {!done && <p className="text-sm text-muted">{body}</p>}
      </div>
      {!done && action}
    </li>
  );
}

export function Dashboard() {
  const t = useTranslations('dashboard');
  const tStatus = useTranslations('status');
  const user = useUser();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [sending, setSending] = useState(false);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.me.sessions() });

  const resend = async () => {
    setSending(true);
    try {
      await api.auth.resendVerification(user.email);
      toast(t('verifyEmailSent'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  const profileDone = Boolean(user.phone);

  return (
    <>
      <PageHeader title={t('greeting', { name: user.fullName.split(' ')[0] ?? user.fullName })} description={t('subtitle')} />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <CardHeader>
            <CardTitle>{t('nextSteps')}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-line">
              <Step
                index={0}
                done={user.emailVerified}
                title={user.emailVerified ? t('verifyEmailDone') : t('verifyEmailTitle')}
                body={t('verifyEmailBody', { email: user.email })}
                action={
                  <Button size="sm" variant="secondary" loading={sending} onClick={resend}>
                    {t('resendEmail')}
                  </Button>
                }
              />
              <Step
                index={1}
                done={profileDone}
                title={t('completeProfileTitle')}
                body={t('completeProfileBody')}
                action={
                  <Link href="/profile" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                    {t('completeProfileAction')}
                  </Link>
                }
              />
              <Step
                index={2}
                done={user.mfaEnabled}
                title={user.mfaEnabled ? t('mfaDone') : t('secureTitle')}
                body={t('secureBody')}
                action={
                  <Link href="/security" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                    {t('secureAction')}
                  </Link>
                }
              />
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card className="anim-rise" style={{ ['--i' as string]: 2 }}>
            <CardBody className="flex items-center gap-4">
              <span className="grid size-11 place-items-center rounded-md bg-selection text-link">
                <Smartphone className="size-5" aria-hidden />
              </span>
              <div>
                {sessions.isPending ? (
                  <Skeleton className="h-5 w-36" />
                ) : (
                  <p className="font-medium">{t('activeSessions', { count: sessions.data?.length ?? 0 })}</p>
                )}
                <div className="mt-1 flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-muted" aria-hidden />
                  <Badge tone={user.status === 'ACTIVE' ? 'ok' : 'warn'}>{tStatus(user.status)}</Badge>
                </div>
              </div>
            </CardBody>
          </Card>

          <OrganizationsCard />
        </div>
      </div>
    </>
  );
}
