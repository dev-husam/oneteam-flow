'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/spinner';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth/auth-context';

function FullPageSpinner() {
  const t = useTranslations('common');
  return (
    <div className="grid min-h-dvh place-items-center text-muted">
      <Spinner className="size-6" label={t('loading')} />
    </div>
  );
}

/** Pages behind sign-in. The backend still enforces every call; this only avoids showing a broken page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated') return <FullPageSpinner />;
  return <>{children}</>;
}

/** Sign-in and sign-up pages send an already signed-in user to the dashboard. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  if (status === 'authenticated') return <FullPageSpinner />;
  return <>{children}</>;
}
