'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { applyFieldErrors } from '@/features/auth/forms';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { MY_ORGS_KEY, orgKey, useOrg } from '@/lib/org/org-context';

const TIMEZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];
const schema = z.object({
  name: z.string().trim().min(2, 'minLength').max(120, 'maxLength'),
  description: z.string().trim().max(1000, 'maxLength'),
  contactEmail: z.string().trim().refine((v) => v === '' || z.email().safeParse(v).success, 'email'),
  contactPhone: z.string().trim().refine((v) => v === '' || /^\+[1-9]\d{6,14}$/.test(v), 'phone'),
  timezone: z.string().min(1, 'required'),
  defaultLocale: z.enum(['en', 'ar']),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
});
type Values = z.input<typeof schema>;

export function SettingsPage() {
  const t = useTranslations('settings');
  const tv = useTranslations('validation');
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, context, can } = useOrg();
  const org = context.organization;
  const editable = can('org.settings.update');
  const [error, setError] = useState<unknown>(null);

  const { register, handleSubmit, setError: setFieldError, formState: { errors, isDirty } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: org.name, description: org.description ?? '', contactEmail: org.contactEmail ?? '', contactPhone: org.contactPhone ?? '',
      timezone: org.timezone, defaultLocale: org.defaultLocale, weekStartsOn: org.weekStartsOn,
    },
  });
  const fieldError = (key?: string) => (key ? tv(key as 'required') : undefined);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const d = schema.parse(v);
      return api.org(orgId).update({
        name: d.name, description: d.description || undefined, contactEmail: d.contactEmail || undefined, contactPhone: d.contactPhone || undefined,
        timezone: d.timezone, defaultLocale: d.defaultLocale, weekStartsOn: d.weekStartsOn,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: MY_ORGS_KEY });
      toast(t('saved'));
    },
    onError: (err) => { if (!applyFieldErrors(err, setFieldError, ['name', 'contactEmail', 'contactPhone', 'timezone'])) setError(err); },
  });

  const leave = useMutation({
    mutationFn: () => api.org(orgId).leave(),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: MY_ORGS_KEY }); toast(t('left')); router.replace('/dashboard'); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const days = [0, 1, 2, 3, 4, 5, 6];
  const dayName = (d: number) => new Intl.DateTimeFormat(context.organization.defaultLocale, { weekday: 'long' }).format(new Date(2024, 0, 7 + d));

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card className="anim-rise max-w-3xl">
        <CardHeader><CardTitle>{t('general')}</CardTitle></CardHeader>
        <CardBody>
          {!editable && <Alert tone="info" className="mb-4">{t('readOnly')}</Alert>}
          {error !== null && <div className="mb-4"><ErrorAlert error={error} /></div>}
          <form onSubmit={handleSubmit((v) => { setError(null); save.mutate(v); })} noValidate className="space-y-4">
            <fieldset disabled={!editable} className="space-y-4">
              <Field label={t('name')} error={fieldError(errors.name?.message)}>{(c) => <Input {...c} {...register('name')} />}</Field>
              <Field label={t('description')} optionalLabel={t('optional')} error={fieldError(errors.description?.message)}>{(c) => <Input {...c} {...register('description')} />}</Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('contactEmail')} optionalLabel={t('optional')} error={fieldError(errors.contactEmail?.message)}>{(c) => <Input {...c} type="email" dir="ltr" className="text-start" {...register('contactEmail')} />}</Field>
                <Field label={t('contactPhone')} optionalLabel={t('optional')} error={fieldError(errors.contactPhone?.message)}>{(c) => <Input {...c} dir="ltr" className="text-start" placeholder="+966501234567" {...register('contactPhone')} />}</Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('timezone')} error={fieldError(errors.timezone?.message)}>{(c) => <Select {...c} dir="ltr" {...register('timezone')}>{TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}</Select>}</Field>
                <Field label={t('defaultLocale')}>{(c) => <Select {...c} {...register('defaultLocale')}><option value="en">English</option><option value="ar">العربية</option></Select>}</Field>
                <Field label={t('weekStartsOn')}>{(c) => <Select {...c} {...register('weekStartsOn')}>{days.map((d) => <option key={d} value={d}>{dayName(d)}</option>)}</Select>}</Field>
              </div>
            </fieldset>
            <dl className="grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">{t('address')}</dt><dd className="ltr-isolate font-mono">/o/{org.slug}</dd></div>
              <div><dt className="text-muted">{t('category')}</dt><dd>{t(`categoryName.${org.categoryKey}` as 'categoryName.fitness')}</dd></div>
            </dl>
            {editable && <Button type="submit" loading={save.isPending} disabled={!isDirty}>{t('save')}</Button>}
          </form>
        </CardBody>
      </Card>

      <Card className="anim-rise mt-5 max-w-3xl border-danger/30">
        <CardHeader><CardTitle className="text-danger">{t('dangerZone')}</CardTitle></CardHeader>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-muted">{t('leaveBody')}</p>
          <ConfirmButton confirmLabel={t('confirmAgain')} onConfirm={() => leave.mutateAsync()}>{t('leave')}</ConfirmButton>
        </CardBody>
      </Card>
    </>
  );
}
