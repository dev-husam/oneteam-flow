'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Link, useRouter } from '@/i18n/navigation';
import { useBrand } from '@/components/brand/brand-provider';
import { useAuth } from '@/lib/auth/auth-context';
import { MfaStep } from './mfa-step';
import { safeNext } from './forms';
import { loginSchema, type LoginValues } from './schemas';

export function LoginForm() {
  const t = useTranslations();
  const { registrationOpen } = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [shake, setShake] = useState(0);
  const reason = params.get('reason');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const fieldError = (key?: string) => (key ? t(`validation.${key}` as 'validation.required') : undefined);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const outcome = await login(values.email, values.password);
      if (outcome.status === 'mfa') return setMfaToken(outcome.mfaToken);
      router.replace(safeNext(params.get('next')) ?? '/dashboard');
    } catch (err) {
      setError(err);
      setShake((n) => n + 1);
    }
  });

  if (mfaToken) {
    return <MfaStep mfaToken={mfaToken} onExpired={() => setMfaToken(null)} onDone={() => router.replace(safeNext(params.get('next')) ?? '/dashboard')} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.login.title')}</h1>
        <p className="text-sm text-muted">{t('auth.login.subtitle')}</p>
      </div>

      {reason === 'session' && <Alert tone="warn">{t('auth.login.sessionEnded')}</Alert>}
      {reason === 'signedOut' && <Alert tone="ok">{t('auth.login.signedOut')}</Alert>}
      {error !== null && <ErrorAlert error={error} />}

      <form key={shake} onSubmit={onSubmit} noValidate className={shake > 0 ? 'anim-shake space-y-4' : 'space-y-4'}>
        <Field label={t('auth.login.email')} error={fieldError(errors.email?.message)}>
          {(c) => <Input {...c} type="email" autoComplete="email" dir="ltr" inputMode="email" autoFocus className="text-start" {...register('email')} />}
        </Field>
        <Field label={t('auth.login.password')} error={fieldError(errors.password?.message)}>
          {(c) => <PasswordInput {...c} autoComplete="current-password" {...register('password')} />}
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-link hover:underline">
            {t('auth.login.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>

      {registrationOpen && (
        <p className="text-center text-sm text-muted">
          {t('auth.login.noAccount')}{' '}
          <Link href="/register" className="font-medium text-link hover:underline">
            {t('auth.login.createAccount')}
          </Link>
        </p>
      )}
    </div>
  );
}
