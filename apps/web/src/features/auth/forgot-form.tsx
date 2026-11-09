'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { forgotSchema, type ForgotValues } from './schemas';

export function ForgotForm() {
  const t = useTranslations();
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api.auth.requestPasswordReset(email);
      setDone(true);
    } catch (err) {
      setError(err);
    }
  });

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
          <MailCheck className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgot.successTitle')}</h1>
        <p className="text-sm text-muted">{t('auth.forgot.successBody')}</p>
        <Link href="/login" className="inline-block text-sm font-medium text-link hover:underline">
          {t('auth.forgot.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgot.title')}</h1>
        <p className="text-sm text-muted">{t('auth.forgot.subtitle')}</p>
      </div>
      {error !== null && <ErrorAlert error={error} />}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('auth.login.email')} error={errors.email?.message ? t(`validation.${errors.email.message}` as 'validation.required') : undefined}>
          {(c) => <Input {...c} type="email" autoComplete="email" dir="ltr" inputMode="email" autoFocus className="text-start" {...register('email')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-link hover:underline">
          {t('auth.forgot.backToLogin')}
        </Link>
      </p>
    </div>
  );
}
