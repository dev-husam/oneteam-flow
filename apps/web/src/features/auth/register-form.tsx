'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useBrand } from '@/components/brand/brand-provider';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { applyFieldErrors } from './forms';
import { registerSchema, type RegisterValues } from './schemas';

export function RegisterForm() {
  const t = useTranslations();
  const { registrationOpen } = useBrand();
  const locale = useLocale() as 'en' | 'ar';
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', acceptTerms: false },
  });

  const password = useWatch({ control, name: 'password' });
  const email = useWatch({ control, name: 'email' });

  const fieldError = (key?: string) => (key ? t(`validation.${key}` as 'validation.required') : undefined);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.auth.register({ ...values, locale });
      setDone(true);
    } catch (err) {
      if (!applyFieldErrors(err, setFieldError, ['fullName', 'email', 'password'])) setError(err);
    }
  });

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
          <MailCheck className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.register.successTitle')}</h1>
        <p className="text-sm text-muted">{t('auth.register.successBody')}</p>
        <Link href="/login" className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
          {t('auth.register.signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.register.title')}</h1>
        <p className="text-sm text-muted">{t('auth.register.subtitle')}</p>
      </div>
      {!registrationOpen && <Alert tone="info">{t('adminConfig.inviteOnly')}</Alert>}

      {error !== null && <ErrorAlert error={error} />}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('auth.register.fullName')} error={fieldError(errors.fullName?.message)}>
          {(c) => <Input {...c} autoComplete="name" autoFocus {...register('fullName')} />}
        </Field>
        <Field label={t('auth.register.email')} error={fieldError(errors.email?.message)}>
          {(c) => <Input {...c} type="email" autoComplete="email" dir="ltr" inputMode="email" className="text-start" {...register('email')} />}
        </Field>
        <Field label={t('auth.register.password')} hint={t('auth.register.passwordHint')} error={fieldError(errors.password?.message)}>
          {(c) => <PasswordInput {...c} autoComplete="new-password" strengthOf={password} email={email} {...register('password')} />}
        </Field>
        <div>
          <Checkbox label={t('auth.register.acceptTerms')} invalid={Boolean(errors.acceptTerms)} {...register('acceptTerms')} />
          {errors.acceptTerms && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {fieldError(errors.acceptTerms.message)}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-link hover:underline">
          {t('auth.register.signIn')}
        </Link>
      </p>
    </div>
  );
}
