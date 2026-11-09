'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isValidSlug, slugify } from '@pt/domain';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { MY_ORGS_KEY, useMyOrganizations } from '@/lib/org/org-context';

const schema = z.object({
  name: z.string().trim().min(2, 'minLength').max(120, 'maxLength'),
  slug: z.string().trim().refine((v) => v === '' || isValidSlug(v), 'invalid'),
  categoryKey: z.string().min(1, 'required'),
  timezone: z.string().min(1, 'required'),
});
type Values = z.infer<typeof schema>;

const TIMEZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];

export function CreateOrganizationForm() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'ar';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const mine = useMyOrganizations();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.catalog.categories(), staleTime: 5 * 60_000 });
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const { register, handleSubmit, control, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', categoryKey: '', timezone: browserZone },
  });
  const name = useWatch({ control, name: 'name' });
  const slugInput = useWatch({ control, name: 'slug' });
  const suggestion = slugify(name);
  const effectiveSlug = slugInput.trim() || suggestion;
  const fieldError = (key?: string) => (key ? t(`validation.${key}` as 'validation.required') : undefined);

  const create = useMutation({
    mutationFn: (v: Values) =>
      api.orgs.create({ name: v.name, slug: v.slug.trim() || undefined, categoryKey: v.categoryKey, timezone: v.timezone, defaultLocale: locale }),
    onSuccess: async ({ organization }) => {
      await queryClient.invalidateQueries({ queryKey: MY_ORGS_KEY });
      router.replace(`/o/${organization.slug}`);
    },
    onError: setError,
  });

  const current = mine.data?.[0];
  if (current) {
    // One organization per account: the form is not offered (the API refuses too).
    return (
      <>
        <PageHeader title={t('orgs.createTitle')} />
        <Card className="max-w-2xl">
          <CardBody className="space-y-3">
            <p className="font-medium">{t('orgs.alreadyTitle')}</p>
            <p className="text-sm text-muted">{t('orgs.alreadyBody', { name: current.organization.name })}</p>
            <Link href={`/o/${current.organization.slug}`} className={buttonVariants({ variant: 'secondary' })}>{t('orgs.openIt')}</Link>
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('orgs.createTitle')} description={t('orgs.createSubtitle')} />
      <Card className="anim-rise max-w-2xl">
        <CardBody>
          {error !== null && <div className="mb-4"><ErrorAlert error={error} /></div>}
          <form onSubmit={handleSubmit((v) => { setError(null); create.mutate(v); })} noValidate className="space-y-5">
            <Field label={t('orgs.name')} error={fieldError(errors.name?.message)}>
              {(c) => <Input {...c} autoFocus {...register('name')} />}
            </Field>
            <Field
              label={t('orgs.slug')}
              optionalLabel={t('common.optional')}
              hint={effectiveSlug ? t('orgs.slugPreview', { slug: effectiveSlug }) : t('orgs.slugHint')}
              error={fieldError(errors.slug?.message)}
            >
              {(c) => <Input {...c} dir="ltr" className="text-start" placeholder={suggestion || 'my-gym'} {...register('slug')} />}
            </Field>
            <Field label={t('orgs.categoryLabel')} error={fieldError(errors.categoryKey?.message)}>
              {(c) => (
                <Select {...c} {...register('categoryKey')} disabled={categories.isPending}>
                  <option value="">{t('orgs.categoryPlaceholder')}</option>
                  {categories.data?.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.name[locale]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('orgs.timezone')} error={fieldError(errors.timezone?.message)}>
              {(c) => (
                <Select {...c} dir="ltr" {...register('timezone')}>
                  {TIMEZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={create.isPending}>
                {t('orgs.createSubmit')}
              </Button>
              <Button variant="ghost" onClick={() => router.back()}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
