'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminEmailTemplate, AdminEmailTemplateRow, MailTemplateText } from '@pt/api-client';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { configFieldErrors } from '@/lib/config-errors';
import { useErrorMessage } from '@/lib/errors';

type TemplateName = 'verify-email' | 'reset-password' | 'email-exists' | 'password-changed' | 'invitation' | 'notification';
type FieldRule = 'required' | 'too_long' | 'invalid' | 'placeholder' | 'link_in_text' | 'no_button';
const RULES: readonly string[] = ['required', 'too_long', 'invalid', 'placeholder', 'link_in_text', 'no_button'];

/** The editable wording of every e-mail the platform sends. */
export function AdminEmailTemplatesPage() {
  const [editing, setEditing] = useState<{ key: string; locale: 'en' | 'ar' } | null>(null);
  return editing ? <TemplateEditor templateKey={editing.key} locale={editing.locale} onBack={() => setEditing(null)} /> : <TemplateList onEdit={setEditing} />;
}

function TemplateList({ onEdit }: { onEdit: (t: { key: string; locale: 'en' | 'ar' }) => void }) {
  const t = useTranslations('adminConfig.templates');
  const rows = useQuery({ queryKey: ['admin', 'email-templates'], queryFn: () => api.admin.emailTemplates.list() });
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {rows.isPending && <Skeleton className="h-64" />}
      {rows.isError && <ErrorAlert error={rows.error} />}
      {rows.data && (
        <Card className="anim-rise">
          <CardBody className="p-0">
            <ul className="divide-y divide-line">
              {rows.data.map((r: AdminEmailTemplateRow) => (
                <li key={`${r.key}:${r.locale}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(`names.${r.key as TemplateName}`)} <span className="text-sm font-normal text-muted">· {t(`locales.${r.locale}`)}</span></p>
                    <p className="truncate text-sm text-muted" dir="auto">{r.subject}</p>
                  </div>
                  <Badge tone={r.customized ? 'accent' : 'neutral'}>{r.customized ? t('customized') : t('builtIn')}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => onEdit({ key: r.key, locale: r.locale })}>{t('edit')}</Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function TemplateEditor({ templateKey, locale, onBack }: { templateKey: string; locale: 'en' | 'ar'; onBack: () => void }) {
  const t = useTranslations('adminConfig.templates');
  const detail = useQuery({ queryKey: ['admin', 'email-template', templateKey, locale], queryFn: () => api.admin.emailTemplates.get(templateKey, locale) });
  return (
    <>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</button>
      <PageHeader title={t(`names.${templateKey as TemplateName}`)} description={t(`locales.${locale}`)} actions={detail.data && <Badge tone={detail.data.custom ? 'accent' : 'neutral'}>{detail.data.custom ? t('customized') : t('builtIn')}</Badge>} />
      {detail.isPending && <Skeleton className="h-96" />}
      {detail.isError && <ErrorAlert error={detail.error} />}
      {/* keyed by the saved state, so the form starts from what the server holds after every save or reset */}
      {detail.data && <TemplateForm key={JSON.stringify(detail.data.custom)} templateKey={templateKey} locale={locale} detail={detail.data} />}
    </>
  );
}

function TemplateForm({ templateKey, locale, detail: loaded }: { templateKey: string; locale: 'en' | 'ar'; detail: AdminEmailTemplate }) {
  const t = useTranslations('adminConfig.templates');
  const tc = useTranslations('adminConfig');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const detail = { data: loaded };
  const [draft, setDraft] = useState<MailTemplateText>(loaded.custom ?? loaded.default);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = useRef<HTMLTextAreaElement>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'email-template', templateKey, locale] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'email-templates'] });
  };
  const fail = (e: unknown) => { setErrors(configFieldErrors(e)); toast(errorMessage(e), 'error'); };
  const save = useMutation({ mutationFn: (d: MailTemplateText) => api.admin.emailTemplates.save(templateKey, locale, d), onMutate: () => setErrors({}), onSuccess: async () => { await refresh(); toast(tc('saved')); }, onError: fail });
  const reset = useMutation({ mutationFn: () => api.admin.emailTemplates.reset(templateKey, locale), onSuccess: async () => { setErrors({}); await refresh(); toast(t('reset')); }, onError: fail });
  const test = useMutation({ mutationFn: (d: MailTemplateText) => api.admin.emailTemplates.test(templateKey, locale, d), onMutate: () => setErrors({}), onSuccess: (r) => toast(t('testSent', { email: r.sentTo })), onError: fail });

  // Live preview of the draft, debounced; invalid drafts simply keep the last good preview.
  const [html, setHtml] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => {
      api.admin.emailTemplates.preview(templateKey, locale, draft).then((r) => setHtml(r.html)).catch(() => undefined);
    }, 350);
    return () => clearTimeout(handle);
  }, [draft, templateKey, locale]);

  const message = (field: string) => {
    const rule = errors[field];
    return rule ? t(`errors.${(RULES.includes(rule) ? rule : 'invalid') as FieldRule}`) : undefined;
  };

  const insert = (placeholder: string) => {
    const el = body.current;
    const token = `{{${placeholder}}}`;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? start;
    setDraft({ ...draft, body: draft.body.slice(0, start) + token + draft.body.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };

  return (
    <>
      {(
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('edit')}</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <Field label={t('subject')} error={message('subject')}>{(c) => <Input {...c} dir={locale === 'ar' ? 'rtl' : 'ltr'} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}</Field>
              <Field label={t('body')} hint={t('bodyHint')} error={message('body')}>
                {(c) => <Textarea {...c} ref={body} rows={9} dir={locale === 'ar' ? 'rtl' : 'ltr'} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}
              </Field>
              {detail.data.hasButton
                ? <Field label={t('action')} error={message('action')}>{(c) => <Input {...c} dir={locale === 'ar' ? 'rtl' : 'ltr'} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />}</Field>
                : <p className="text-sm text-muted">{t('noButton')}</p>}
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-2">{t('placeholders')} <span className="text-xs font-normal text-muted">· {t('insert')}</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.data.placeholders.filter((p) => p !== 'link').map((p) => (
                    <button key={p} type="button" onClick={() => insert(p)} className="ltr-isolate rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-2 hover:bg-selection hover:text-link">{`{{${p}}}`}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button loading={save.isPending} onClick={() => save.mutate(draft)}>{t('saveTemplate')}</Button>
                <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate(draft)}>{t('sendTest')}</Button>
                {detail.data.custom && <ConfirmButton confirmLabel={t('resetToDefault')} onConfirm={() => reset.mutate()}>{t('resetToDefault')}</ConfirmButton>}
              </div>
            </CardBody>
          </Card>
          <Card className="anim-rise" style={{ ['--i' as string]: 1 }}>
            <CardHeader><CardTitle>{t('previewTitle')}</CardTitle></CardHeader>
            <CardBody>
              {/* sandbox="" : the preview can never run scripts, whatever the draft contains */}
              <iframe title={t('previewTitle')} sandbox="" srcDoc={html} className="h-96 w-full rounded-md border border-line bg-white" />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

export type { AdminEmailTemplate };
