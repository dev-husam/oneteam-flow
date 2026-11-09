'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssessmentQuestion, AssessmentTemplate } from '@pt/api-client';
import { ASSESSMENT_LIMITS, QUESTION_KINDS, questionLabel, WHEEL_OF_LIFE_QUESTIONS } from '@pt/domain';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';
import { coachingKey } from './shared';

const newId = (existing: AssessmentQuestion[]): string => {
  let n = existing.length + 1;
  while (existing.some((q) => q.id === `q${n}`)) n += 1;
  return `q${n}`;
};

function TemplateDialog({ template, onClose }: { template?: AssessmentTemplate; onClose: () => void }) {
  const t = useTranslations('coaching.templates');
  const tc = useTranslations('coaching');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(template?.questions ?? []);
  const [error, setError] = useState<unknown>(null);
  const save = useMutation({
    mutationFn: () => (template ? api.org(orgId).coaching.templates.update(template.id, { name, description, questions }) : api.org(orgId).coaching.templates.create({ name, description: description || undefined, questions })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastSaved')); onClose(); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });
  const patch = (i: number, change: Partial<AssessmentQuestion>) => setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...change } : q)));
  const valid = name.trim() && questions.length > 0 && questions.every((q) => q.label.en.trim() || q.label.ar.trim());

  return (
    <Dialog open onClose={onClose} title={template ? t('editTitle') : t('new')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
        {error !== null && <ErrorAlert error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')}>{(c) => <Input {...c} dir="auto" maxLength={ASSESSMENT_LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t('description')}>{(c) => <Input {...c} dir="auto" maxLength={ASSESSMENT_LIMITS.description} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('questions')} <span className="font-normal text-muted">· {t('count', { count: questions.length })}</span></p>
          <div className="flex gap-2">
            {questions.length === 0 && <Button size="sm" variant="secondary" onClick={() => setQuestions(WHEEL_OF_LIFE_QUESTIONS.map((q) => ({ ...q })))}>{t('useWheel')}</Button>}
            <Button size="sm" variant="secondary" disabled={questions.length >= ASSESSMENT_LIMITS.maxQuestions} onClick={() => setQuestions((qs) => [...qs, { id: newId(qs), kind: 'SCALE', label: { en: '', ar: '' } }])}><Plus className="size-4" aria-hidden /> {t('addQuestion')}</Button>
          </div>
        </div>
        <ul className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="space-y-2 rounded-md border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end">
                <Field label={t('labelEn')}>{(c) => <Input {...c} maxLength={ASSESSMENT_LIMITS.label} value={q.label.en} onChange={(e) => patch(i, { label: { ...q.label, en: e.target.value } })} />}</Field>
                <Field label={t('labelAr')}>{(c) => <Input {...c} dir="rtl" maxLength={ASSESSMENT_LIMITS.label} value={q.label.ar} onChange={(e) => patch(i, { label: { ...q.label, ar: e.target.value } })} />}</Field>
                <Field label={t('questions')}>{(c) => <Select {...c} value={q.kind} onChange={(e) => patch(i, { kind: e.target.value as AssessmentQuestion['kind'] })}>{QUESTION_KINDS.map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}</Select>}</Field>
                <Button variant="ghost" size="icon" aria-label={t('removeQuestion')} onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
            </li>
          ))}
        </ul>
        {questions.length > 0 && <p className="text-xs text-muted">{t('labelHint')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>{tc('save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The organization’s reusable questionnaires. Any coach can use them; coaches edit their own, owners any. */
export function TemplatesPage() {
  const t = useTranslations('coaching.templates');
  const locale = useLocale() as 'en' | 'ar';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, context } = useOrg();
  const [editing, setEditing] = useState<AssessmentTemplate | 'new' | null>(null);
  const templates = useQuery({ queryKey: coachingKey(orgId, 'templates'), queryFn: () => api.org(orgId).coaching.templates.list() });
  const archive = useMutation({ mutationFn: (id: string) => api.org(orgId).coaching.templates.archive(id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: coachingKey(orgId) }); toast(t('toastArchived')); }, onError: (e) => toast(errorMessage(e), 'error') });
  const me = context.membership.id;
  const isOwner = context.membership.role.key === 'owner';
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> {t('new')}</Button>} />
      <Card className="anim-rise">
        <CardBody className="p-0">
          {templates.isPending && <div className="p-4"><Skeleton className="h-16" /></div>}
          {templates.isError && <div className="p-4"><ErrorAlert error={templates.error} /></div>}
          {templates.data?.length === 0 && <EmptyState icon={ClipboardList} title={t('empty')}>{t('emptyBody')}</EmptyState>}
          <ul className="divide-y divide-line">
            {templates.data?.map((x) => {
              const mine = x.createdByMembershipId === me || isOwner;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" dir="auto">{x.name}</p>
                    <p className="text-xs text-muted" dir="auto">{t('count', { count: x.questions.length })} · {x.questions.slice(0, 3).map((q) => questionLabel(q, locale)).join(', ')}{x.questions.length > 3 ? '…' : ''}</p>
                  </div>
                  {mine && <Button size="sm" variant="secondary" onClick={() => setEditing(x)}>{t('edit')}</Button>}
                  {mine && <ConfirmButton size="sm" confirmLabel={t('archiveConfirm')} onConfirm={() => archive.mutate(x.id)}>{t('archive')}</ConfirmButton>}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
      {editing && <TemplateDialog key={editing === 'new' ? 'new' : editing.id} template={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
