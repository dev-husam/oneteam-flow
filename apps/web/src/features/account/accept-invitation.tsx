'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';
import { MY_ORGS_KEY } from '@/lib/org/org-context';

/** /invitations/accept?token=…: shows what the invitation is for and lets the invited, verified account accept it. */
export function AcceptInvitation() {
  const t = useTranslations('invite');
  const tRole = useTranslations();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, user, logout } = useAuth();

  const preview = useQuery({ queryKey: ['invitation-preview', token], queryFn: () => api.invitations.preview(token), enabled: token.length > 0, retry: false });
  const accept = useMutation({
    mutationFn: () => api.invitations.accept(token),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: MY_ORGS_KEY });
      router.replace(`/o/${result.slug}`);
    },
  });
  const next = encodeURIComponent(`/invitations/accept?token=${token}`);

  if (!token) return <Alert tone="danger">{t('missingToken')}</Alert>;
  if (preview.isPending) return <Skeleton className="h-48" />;
  if (preview.isError) {
    return (
      <div className="space-y-4">
        <ErrorAlert error={preview.error} />
        <Link href="/dashboard" className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
          {t('toDashboard')}
        </Link>
      </div>
    );
  }

  const inv = preview.data;
  const roleKey = inv.role.labelKey as Parameters<typeof tRole>[0];
  const role = tRole.has(roleKey) ? tRole(roleKey) : inv.role.name;
  const wrongAccount = status === 'authenticated' && user && user.email.toLowerCase() !== inv.email.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-selection text-link">
          <MailOpen className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title', { org: inv.organization.name })}</h1>
        <p className="text-sm text-muted">{t('body', { inviter: inv.invitedBy, role })}</p>
        <p className="ltr-isolate inline-block rounded-md bg-surface-2 px-3 py-1 text-sm">{inv.email}</p>
      </div>

      {accept.isError && <ErrorAlert error={accept.error} />}

      {status === 'loading' && <Skeleton className="h-10" />}

      {status === 'anonymous' && (
        <div className="space-y-3">
          <Alert tone="info">{t('signInFirst', { email: inv.email })}</Alert>
          <Link href={`/login?next=${next}`} className={buttonVariants({ size: 'lg', className: 'w-full' })}>
            {t('signIn')}
          </Link>
          <Link href="/register" className={buttonVariants({ size: 'lg', variant: 'secondary', className: 'w-full' })}>
            {t('createAccount')}
          </Link>
        </div>
      )}

      {status === 'authenticated' && user && (
        <div className="space-y-3">
          {wrongAccount && (
            <Alert tone="warn">
              {t('wrongAccount', { current: user.email, invited: inv.email })}{' '}
              <button type="button" className="font-medium underline" onClick={() => void logout().then(() => router.replace(`/login?next=${next}`))}>
                {t('switchAccount')}
              </button>
            </Alert>
          )}
          {!user.emailVerified && <Alert tone="warn">{t('verifyFirst')}</Alert>}
          <Button size="lg" className="w-full" loading={accept.isPending} disabled={Boolean(wrongAccount) || !user.emailVerified} onClick={() => accept.mutate()}>
            {t('accept')}
          </Button>
        </div>
      )}
    </div>
  );
}
