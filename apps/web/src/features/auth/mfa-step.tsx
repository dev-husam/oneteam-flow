'use client';

import { ApiError } from '@pt/api-client';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/auth-context';

/** Second step of sign-in for accounts with two-factor authentication: authenticator code or recovery code. */
export function MfaStep({ mfaToken, onDone, onExpired }: { mfaToken: string; onDone: () => void; onExpired: () => void }) {
  const t = useTranslations('mfa');
  const { completeMfa } = useAuth();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await completeMfa(mfaToken, code.trim());
      onDone();
    } catch (err) {
      // The five-minute step-up window ended: start again from the password.
      if (err instanceof ApiError && err.code === 'MFA_TOKEN_INVALID') return onExpired();
      setError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-selection text-link">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('loginTitle')}</h1>
        <p className="text-sm text-muted">{recovery ? t('loginRecoveryHint') : t('loginHint')}</p>
      </div>
      {error !== null && <ErrorAlert error={error} />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={recovery ? t('recoveryCode') : t('code')}>
          {(c) => (
            <Input
              {...c}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              inputMode={recovery ? 'text' : 'numeric'}
              maxLength={recovery ? 11 : 6}
              dir="ltr"
              className="text-center font-mono text-lg tracking-widest"
              placeholder={recovery ? 'xxxxx-xxxxx' : '000000'}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.trim().length < 6}>
          {t('verify')}
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <button type="button" className="font-medium text-link hover:underline" onClick={() => { setRecovery((v) => !v); setCode(''); setError(null); }}>
          {recovery ? t('useAuthenticator') : t('useRecovery')}
        </button>
        <button type="button" className="text-muted hover:text-ink" onClick={onExpired}>
          {t('startOver')}
        </button>
      </div>
    </div>
  );
}
