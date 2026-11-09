'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type AdminSettings, type IdentitySettings, type MailBrandSettings } from '@pt/api-client';
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from '@pt/domain';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { API_BASE } from '@/lib/public-config';
import { api } from '@/lib/api';
import { configFieldErrors } from '@/lib/config-errors';
import { useErrorMessage } from '@/lib/errors';

type ErrKey = 'color' | 'contrast' | 'radius' | 'required' | 'invalid' | 'email';

/** Name, logo, colours and e-mail branding. Each card saves on its own; the server validates every value. */
export function AdminSettingsPage() {
  const t = useTranslations('adminConfig.settings');
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.admin.settings.get() });
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {settings.isPending && <Skeleton className="h-96" />}
      {settings.isError && <ErrorAlert error={settings.error} />}
      {settings.data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <IdentityCard key={JSON.stringify(settings.data.identity)} value={settings.data.identity} />
          <DesignsLinkCard />
          <LogoCard logo={settings.data.logo} />
          <MailCard key={JSON.stringify(settings.data.mail)} value={settings.data.mail} />
        </div>
      )}
    </>
  );
}

function useSave<T>(save: (v: T) => Promise<unknown>) {
  const t = useTranslations('adminConfig');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: save,
    onMutate: () => setFieldErrors({}),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }); toast(t('saved')); },
    onError: (e) => {
      const fields = configFieldErrors(e);
      setFieldErrors(fields);
      toast(errorMessage(e), 'error');
    },
  });
  return { mutation, fieldErrors };
}

function useFieldMessage() {
  const t = useTranslations('adminConfig.settings.errors');
  return (rule?: string) => (rule ? t((rule in { color: 1, contrast: 1, radius: 1, required: 1, invalid: 1, email: 1 } ? rule : 'invalid') as ErrKey) : undefined);
}

function IdentityCard({ value }: { value: IdentitySettings }) {
  const t = useTranslations('adminConfig.settings');
  const tc = useTranslations('adminConfig');
  const message = useFieldMessage();
  const [v, setV] = useState(value);
  const { mutation, fieldErrors } = useSave((x: IdentitySettings) => api.admin.settings.saveIdentity(x));
  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('identity')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <Field label={t('appNameEn')} error={message(fieldErrors['appName.en'])}>{(c) => <Input {...c} value={v.appName.en} onChange={(e) => setV({ ...v, appName: { ...v.appName, en: e.target.value } })} />}</Field>
        <Field label={t('appNameAr')} error={message(fieldErrors['appName.ar'])}>{(c) => <Input {...c} dir="rtl" value={v.appName.ar} onChange={(e) => setV({ ...v, appName: { ...v.appName, ar: e.target.value } })} />}</Field>
        <Field label={t('taglineEn')} error={message(fieldErrors['tagline.en'])}>{(c) => <Input {...c} value={v.tagline.en} onChange={(e) => setV({ ...v, tagline: { ...v.tagline, en: e.target.value } })} />}</Field>
        <Field label={t('taglineAr')} error={message(fieldErrors['tagline.ar'])}>{(c) => <Input {...c} dir="rtl" value={v.tagline.ar} onChange={(e) => setV({ ...v, tagline: { ...v.tagline, ar: e.target.value } })} />}</Field>
        <Field label={t('supportEmail')} hint={t('supportHint')} error={message(fieldErrors.supportEmail)}>
          {(c) => <Input {...c} type="email" dir="ltr" value={v.supportEmail ?? ''} onChange={(e) => setV({ ...v, supportEmail: e.target.value || null })} />}
        </Field>
        <Button loading={mutation.isPending} onClick={() => mutation.mutate(v)}>{tc('save')}</Button>
      </CardBody>
    </Card>
  );
}

function DesignsLinkCard() {
  const t = useTranslations('adminConfig.settings');
  const td = useTranslations('adminConfig.designs');
  return (
    <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
      <CardHeader><CardTitle>{td('title')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">{t('designsHint')}</p>
        <Link href="/admin/designs" className={buttonVariants({ variant: 'secondary' })}>{t('openDesigns')}</Link>
      </CardBody>
    </Card>
  );
}

function LogoCard({ logo }: { logo: AdminSettings['logo'] }) {
  const t = useTranslations('adminConfig.settings');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      return api.admin.settings.setLogo(file.type, btoa(binary));
    },
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({ mutationFn: () => api.admin.settings.removeLogo(), onSuccess: refresh, onError: (e) => toast(errorMessage(e), 'error') });
  return (
    <Card className="anim-rise" style={{ ['--i' as string]: 2 }}>
      <CardHeader><CardTitle>{t('logo')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-4">
          {logo
            ? <img src={`${API_BASE}${logo.url}`} alt="" className="size-16 rounded-md border border-line object-contain p-1" />
            : <p className="text-sm text-muted">{t('logoNone')}</p>}
        </div>
        <p className="text-xs text-muted">{t('logoHint')}</p>
        <input
          ref={input}
          type="file"
          hidden
          accept={LOGO_MIME_TYPES.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > LOGO_MAX_BYTES) { toast(errorMessage(new ApiError('LOGO_INVALID', 400)), 'error'); return; }
            upload.mutate(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}>{t('logoUpload')}</Button>
          {logo && <Button variant="danger-soft" loading={remove.isPending} onClick={() => remove.mutate()}>{t('logoRemove')}</Button>}
        </div>
      </CardBody>
    </Card>
  );
}

function MailCard({ value }: { value: MailBrandSettings }) {
  const t = useTranslations('adminConfig.settings');
  const tc = useTranslations('adminConfig');
  const message = useFieldMessage();
  const [v, setV] = useState(value);
  const { mutation, fieldErrors } = useSave((x: MailBrandSettings) => api.admin.settings.saveMail(x));
  return (
    <Card className="anim-rise" style={{ ['--i' as string]: 3 }}>
      <CardHeader><CardTitle>{t('mail')}</CardTitle><p className="text-xs text-muted">{t('mailHint')}</p></CardHeader>
      <CardBody className="space-y-4">
        <Field label={t('fromName')} error={message(fieldErrors.fromName)}>{(c) => <Input {...c} value={v.fromName} onChange={(e) => setV({ ...v, fromName: e.target.value })} />}</Field>
        <Field label={t('footerEn')} error={message(fieldErrors['footer.en'])}>{(c) => <Input {...c} value={v.footer.en} onChange={(e) => setV({ ...v, footer: { ...v.footer, en: e.target.value } })} />}</Field>
        <Field label={t('footerAr')} error={message(fieldErrors['footer.ar'])}>{(c) => <Input {...c} dir="rtl" value={v.footer.ar} onChange={(e) => setV({ ...v, footer: { ...v.footer, ar: e.target.value } })} />}</Field>
        <Button loading={mutation.isPending} onClick={() => mutation.mutate(v)}>{tc('save')}</Button>
      </CardBody>
    </Card>
  );
}
