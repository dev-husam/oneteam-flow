'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

type State = 'verifying' | 'ok' | 'failed';

export function VerifyEmail() {
  const t = useTranslations('auth.verify');
  const token = useSearchParams().get('token');
  const { status, reloadUser } = useAuth();
  const [state, setState] = useState<State>(token ? 'verifying' : 'failed');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // the link is single-use: never submit it twice (strict mode runs effects twice)
    api.auth
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('failed'));
  }, [token]);

  useEffect(() => {
    if (state === 'ok' && status === 'authenticated') void reloadUser().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload once when verification succeeds
  }, [state, status === 'authenticated']);

  const signedIn = status === 'authenticated';
  const cta = (
    <Link href={signedIn ? '/dashboard' : '/login'} className={buttonVariants({ className: 'w-full' })}>
      {signedIn ? t('continue') : t('goToLogin')}
    </Link>
  );

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center" aria-live="polite">
        <Spinner className="size-7 text-link" />
        <p className="text-muted">{t('verifying')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center" aria-live="polite">
      <div className={`mx-auto grid size-14 place-items-center rounded-full ${state === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
        {state === 'ok' ? <CheckCircle2 className="size-7" aria-hidden /> : <XCircle className="size-7" aria-hidden />}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{state === 'ok' ? t('successTitle') : t('failedTitle')}</h1>
      <p className="text-sm text-muted">{state === 'ok' ? t('successBody') : t('failedBody')}</p>
      {cta}
    </div>
  );
}
