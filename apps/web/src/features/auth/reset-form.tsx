'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { resetSchema, type ResetValues } from './schemas';

export function ResetForm() {
  const t = useTranslations();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '' } });

  const password = useWatch({ control, name: 'password' });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setError(null);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err);
    }
  });

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert tone="danger">{t('auth.reset.missingToken')}</Alert>
        <Link href="/forgot-password" className={buttonVariants({ className: 'w-full' })}>
          {t('auth.reset.requestNew')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.reset.successTitle')}</h1>
        <p className="text-sm text-muted">{t('auth.reset.successBody')}</p>
        <Link href="/login" className={buttonVariants({ className: 'w-full' })}>
          {t('auth.verify.goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.reset.title')}</h1>
        <p className="text-sm text-muted">{t('auth.reset.subtitle')}</p>
      </div>
      {error !== null && <ErrorAlert error={error} />}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('auth.reset.newPassword')} error={errors.password?.message ? t(`validation.${errors.password.message}` as 'validation.required') : undefined}>
          {(c) => <PasswordInput {...c} autoComplete="new-password" autoFocus strengthOf={password} {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
        </Button>
      </form>
    </div>
  );
}
