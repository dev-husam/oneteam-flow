'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth, useUser } from '@/lib/auth/auth-context';
import { applyFieldErrors } from './auth/forms';

const schema = z.object({
  fullName: z.string().trim().min(2, 'minLength').max(120, 'maxLength'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+[1-9]\d{6,14}$/.test(v), 'phone'),
  locale: z.enum(['en', 'ar']),
  timezone: z.string().min(1, 'required'),
  unitSystem: z.enum(['METRIC', 'IMPERIAL']),
});
type Values = z.infer<typeof schema>;

export function ProfileForm() {
  const t = useTranslations();
  const user = useUser();
  const { setUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [error, setError] = useState<unknown>(null);

  const timezones = useMemo(() => [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])], []);

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: user.fullName,
      phone: user.phone ?? '',
      locale: user.locale,
      timezone: user.timezone,
      unitSystem: user.unitSystem,
    },
  });

  const fieldError = (key?: string) => (key ? t(`validation.${key}` as 'validation.required') : undefined);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const updated = await api.me.update({ ...values, phone: values.phone === '' ? null : values.phone });
      setUser(updated);
      reset({ ...values, phone: updated.phone ?? '' });
      toast(t('common.saved'));
      // Choosing another language switches the interface right away.
      if (updated.locale !== currentLocale) router.replace(pathname, { locale: updated.locale });
    } catch (err) {
      if (!applyFieldErrors(err, setFieldError, ['fullName', 'phone', 'timezone'])) setError(err);
    }
  });

  return (
    <>
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />
      <Card className="anim-rise max-w-2xl" style={{ ['--i' as string]: 1 }}>
        <CardHeader>
          <CardTitle>{user.fullName}</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error !== null && <ErrorAlert error={error} />}

            <Field label={t('profile.fullName')} error={fieldError(errors.fullName?.message)}>
              {(c) => <Input {...c} autoComplete="name" {...register('fullName')} />}
            </Field>

            <Field label={t('profile.email')}>
              {(c) => (
                <div className="flex items-center gap-3">
                  <Input {...c} value={user.email} readOnly dir="ltr" className="text-start" />
                  <Badge tone={user.emailVerified ? 'ok' : 'warn'} className="shrink-0">
                    {user.emailVerified ? t('profile.emailVerified') : t('profile.emailNotVerified')}
                  </Badge>
                </div>
              )}
            </Field>

            <Field label={t('profile.phone')} hint={t('profile.phoneHint')} optionalLabel={t('common.optional')} error={fieldError(errors.phone?.message)}>
              {(c) => <Input {...c} type="tel" dir="ltr" autoComplete="tel" placeholder="+966501234567" className="text-start" {...register('phone')} />}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('profile.locale')}>
                {(c) => (
                  <Select {...c} {...register('locale')}>
                    <option value="en">{t('language.en')}</option>
                    <option value="ar">{t('language.ar')}</option>
                  </Select>
                )}
              </Field>
              <Field label={t('profile.unitSystem')}>
                {(c) => (
                  <Select {...c} {...register('unitSystem')}>
                    <option value="METRIC">{t('profile.unitMetric')}</option>
                    <option value="IMPERIAL">{t('profile.unitImperial')}</option>
                  </Select>
                )}
              </Field>
            </div>

            <Field label={t('profile.timezone')} error={fieldError(errors.timezone?.message)}>
              {(c) => (
                <Select {...c} dir="ltr" className="text-start" {...register('timezone')}>
                  {timezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                {isSubmitting ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
