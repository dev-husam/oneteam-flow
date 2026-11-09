'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminDesign } from '@pt/api-client';
import {
  DESIGN_FONTS, DESIGN_RADII, DESIGN_TOKEN_GROUPS, validateDesign,
  type DesignIssue, type DesignTokenGroup, type DesignTokenKey,
} from '@pt/domain';
import { ArrowLeft, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { DesignPreview } from '@/components/brand/design-preview';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

const GROUPS = Object.keys(DESIGN_TOKEN_GROUPS) as DesignTokenGroup[];
/** `actionPrimaryHover` → "Action primary hover": token names are technical identifiers, shown as written in the specification. */
const tokenLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());


// ---------------------------------------------------------------------------------------------- list

function NewDesignDialog({ designs, onClose }: { designs: AdminDesign[]; onClose: () => void }) {
  const t = useTranslations('adminConfig.designs');
  const tc = useTranslations('adminConfig');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [basedOn, setBasedOn] = useState(designs.find((d) => d.isDefault)?.key ?? designs[0]?.key ?? '');
  const [error, setError] = useState<unknown>(null);
  const create = useMutation({
    mutationFn: () => api.admin.designs.create({ name, basedOn }),
    onSuccess: async (d) => { await queryClient.invalidateQueries({ queryKey: ['admin', 'designs'] }); toast(t('toastCreated')); router.push(`/admin/designs/${d.key}`); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });
  return (
    <Dialog open onClose={onClose} title={t('newTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
        {error !== null && <ErrorAlert error={error} />}
        <Field label={t('name')}>{(c) => <Input {...c} dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('basedOn')}>{(c) => <Select {...c} value={basedOn} onChange={(e) => setBasedOn(e.target.value)}>{designs.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</Select>}</Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>{t('create')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** All designs: choose the default, edit, duplicate, reset a built-in one or delete a custom one. */
export function AdminDesigns() {
  const t = useTranslations('adminConfig.designs');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['admin', 'designs'], queryFn: () => api.admin.designs.list() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const makeDefault = useMutation({ mutationFn: (key: string) => api.admin.designs.setDefault(key), onSuccess: async () => { await refresh(); toast(t('defaultChanged')); }, onError: fail });
  const duplicate = useMutation({ mutationFn: (d: AdminDesign) => api.admin.designs.create({ basedOn: d.key, name: `${d.name} copy` }), onSuccess: async (d) => { await refresh(); toast(t('toastCreated')); router.push(`/admin/designs/${d.key}`); }, onError: fail });
  const reset = useMutation({ mutationFn: (key: string) => api.admin.designs.reset(key), onSuccess: async () => { await refresh(); toast(t('toastReset')); }, onError: fail });
  const offer = useMutation({ mutationFn: (v: { key: string; on: boolean }) => api.admin.designs.update(v.key, { userSelectable: v.on }), onSuccess: async () => { await refresh(); toast(t('offerChanged')); }, onError: fail });
  const remove = useMutation({ mutationFn: (key: string) => api.admin.designs.remove(key), onSuccess: async () => { await refresh(); toast(t('toastDeleted')); }, onError: fail });

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Button onClick={() => setCreating(true)} disabled={!list.data}>{t('new')}</Button>} />
      {list.isPending && <Skeleton className="h-64" />}
      {list.isError && <ErrorAlert error={list.error} />}
      <div className="grid gap-5 lg:grid-cols-2">
        {list.data?.map((d, i) => (
          <Card key={d.key} className="anim-rise" style={{ ['--i' as string]: i }}>
            <CardHeader className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2">{d.name}
                {d.isDefault && <Badge tone="ok"><Check className="size-3" aria-hidden /> {t('default')}</Badge>}
                <Badge tone="neutral">{d.builtIn ? t('builtIn') : t('custom')}</Badge>
              </CardTitle>
              {d.description && <p className="text-sm text-muted">{d.description}</p>}
              <p className="text-xs text-muted">{t('inUse', { count: d.organizationCount })} · {t('usersChose', { count: d.userCount })}</p>
              {d.userSelectable && <Badge tone="accent">{t('offered')}</Badge>}
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
                <DesignPreview design={d} mode="light" compact />
                <DesignPreview design={d} mode="dark" compact />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/designs/${d.key}`} className={buttonVariants({ size: 'sm' })}>{t('edit')}</Link>
                {!d.isDefault && <Button size="sm" variant="secondary" loading={makeDefault.isPending} onClick={() => makeDefault.mutate(d.key)}>{t('makeDefault')}</Button>}
                <Button size="sm" variant="secondary" loading={offer.isPending} onClick={() => offer.mutate({ key: d.key, on: !d.userSelectable })}>{d.userSelectable ? t('withdrawFromUsers') : t('offerToUsers')}</Button>
                <Button size="sm" variant="secondary" loading={duplicate.isPending} onClick={() => duplicate.mutate(d)}>{t('duplicate')}</Button>
                {d.builtIn && <ConfirmButton size="sm" confirmLabel={t('resetConfirm')} onConfirm={() => reset.mutate(d.key)}>{t('reset')}</ConfirmButton>}
                {!d.builtIn && !d.isDefault && d.organizationCount === 0 && <ConfirmButton size="sm" confirmLabel={t('deleteConfirm')} onConfirm={() => remove.mutate(d.key)}>{t('delete')}</ConfirmButton>}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      {creating && list.data && <NewDesignDialog designs={list.data} onClose={() => setCreating(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- editor

function ColorField({ token, value, onChange, issue }: { token: DesignTokenKey; value: string; onChange: (v: string) => void; issue?: DesignIssue }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label={tokenLabel(token)} value={valid ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-0.5" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-xs', issue ? 'font-medium text-danger' : 'text-muted')}>{tokenLabel(token)}</p>
        <Input aria-label={`${tokenLabel(token)} hex`} dir="ltr" className="h-8 text-start font-mono text-xs" invalid={!valid || issue?.severity === 'error'} value={value} onChange={(e) => onChange(e.target.value.trim().toUpperCase())} />
      </div>
    </div>
  );
}

function IssueList({ issues, tone }: { issues: DesignIssue[]; tone: 'danger' | 'warn' }) {
  const t = useTranslations('adminConfig.designs');
  if (issues.length === 0) return null;
  const text = (i: DesignIssue) =>
    i.rule === 'contrast' ? t('contrast', { token: tokenLabel(i.token), against: tokenLabel(i.against ?? ''), ratio: i.ratio ?? 0, min: i.min ?? 0 })
    : i.rule === 'missing' ? t('missing', { token: tokenLabel(i.token) })
    : t('invalidHex', { token: tokenLabel(i.token) });
  return (
    <Alert tone={tone} title={tone === 'danger' ? t('problems') : t('warnings')}>
      <ul className="list-disc space-y-0.5 ps-5 text-sm">{issues.map((i, k) => <li key={k}>{i.mode === 'theme' ? '' : `${t(i.mode)}: `}{text(i)}</li>)}</ul>
    </Alert>
  );
}

/** Edit one design: every token in both modes, corner style and typeface, with a live preview and the accessibility rules checked as you type. */
export function AdminDesignEditor({ designKey }: { designKey: string }) {
  const td = useTranslations('adminConfig.designs');
  const design = useQuery({ queryKey: ['admin', 'design', designKey], queryFn: () => api.admin.designs.get(designKey) });
  return (
    <>
      <Link href="/admin/designs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {td('back')}</Link>
      {design.isPending && <Skeleton className="h-96" />}
      {design.isError && <ErrorAlert error={design.error} />}
      {/* keyed by what the server holds, so the form starts from the saved design after every save or reset */}
      {design.data && <EditorForm key={design.data.updatedAt} design={design.data} />}
    </>
  );
}

function EditorForm({ design }: { design: AdminDesign }) {
  const t = useTranslations('adminConfig.designs');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState(design.name);
  const [description, setDescription] = useState(design.description);
  const [radius, setRadius] = useState(design.radius);
  const [font, setFont] = useState(design.font);
  const [light, setLight] = useState(design.light);
  const [dark, setDark] = useState(design.dark);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState<unknown>(null);

  const draft = { name, description, radius, font, light, dark };
  const check = validateDesign(draft);
  const issues = check.ok ? [] : check.issues;
  const warnings = check.warnings;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ name: design.name, description: design.description, radius: design.radius, font: design.font, light: design.light, dark: design.dark });
  const tokens = mode === 'light' ? light : dark;
  const setToken = (k: DesignTokenKey, v: string) => (mode === 'light' ? setLight : setDark)((cur) => ({ ...cur, [k]: v }));
  const issueFor = (k: string) => [...issues, ...warnings].find((i) => i.mode === mode && (i.token === k || i.against === k));

  const save = useMutation({
    mutationFn: () => api.admin.designs.update(design.key, draft),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(t('toastSaved')); },
    onError: (e) => { setError(e); toast(errorMessage(e), 'error'); },
  });

  return (
    <>
      <PageHeader title={design.name} description={design.description} actions={<>{design.isDefault && <Badge tone="ok">{t('default')}</Badge>}<Badge tone="neutral">{design.builtIn ? t('builtIn') : t('custom')}</Badge></>} />
      {error !== null && <div className="mb-4"><ErrorAlert error={error} /></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Card>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label={t('name')}>{(c) => <Input {...c} dir="auto" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label={t('description')}>{(c) => <Input {...c} dir="auto" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
              <Field label={t('radius')}>{(c) => <Select {...c} value={radius} onChange={(e) => setRadius(e.target.value as typeof radius)}>{DESIGN_RADII.map((r) => <option key={r} value={r}>{t(`radii.${r}`)}</option>)}</Select>}</Field>
              <Field label={t('font')} hint={t('fontHint')}>{(c) => <Select {...c} value={font} onChange={(e) => setFont(e.target.value as typeof font)}>{DESIGN_FONTS.map((f) => <option key={f} value={f}>{t(`fonts.${f}`)}</option>)}</Select>}</Field>
            </CardBody>
          </Card>
          <div role="tablist" aria-label={t('preview')} className="flex gap-2">
            {(['light', 'dark'] as const).map((m) => (
              <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded-full px-4 py-1.5 text-sm font-medium', mode === m ? 'bg-action-2 text-action-2-ink' : 'bg-surface-2 text-ink-2 hover:text-ink')}>{t(m)}</button>
            ))}
          </div>
          {GROUPS.map((g) => (
            <Card key={g}>
              <CardHeader><CardTitle>{t(`groups.${g}`)}</CardTitle></CardHeader>
              <CardBody className="grid gap-4 sm:grid-cols-2">
                {DESIGN_TOKEN_GROUPS[g].map((k) => <ColorField key={k} token={k} value={tokens[k]} onChange={(v) => setToken(k, v)} issue={issueFor(k)} />)}
              </CardBody>
            </Card>
          ))}
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader><CardTitle>{t('preview')} · {t(mode)}</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <DesignPreview design={{ light, dark, radius, font }} mode={mode} />
              <IssueList issues={issues} tone="danger" />
              <IssueList issues={warnings} tone="warn" />
              <div className="flex flex-wrap items-center gap-2">
                <Button loading={save.isPending} disabled={!dirty || issues.length > 0} onClick={() => { setError(null); save.mutate(); }}>{t('save')}</Button>
                {dirty && <span className="text-xs text-muted">{t('unsaved')}</span>}
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- one organization

/** On an organization's admin page: follow the platform default, or use another design just for this organization. */
export function OrganizationDesign({ orgId }: { orgId: string }) {
  const t = useTranslations('adminConfig.designs');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const designs = useQuery({ queryKey: ['admin', 'designs'], queryFn: () => api.admin.designs.list() });
  const current = useQuery({ queryKey: ['admin', 'org-design', orgId], queryFn: () => api.admin.designs.forOrganization(orgId) });
  const set = useMutation({
    mutationFn: (key: string | null) => api.admin.designs.setForOrganization(orgId, key),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin'] }); toast(t('organizationSaved')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const defaultName = designs.data?.find((d) => d.isDefault)?.name ?? '';
  const chosen = designs.data?.find((d) => d.key === current.data?.themeKey) ?? designs.data?.find((d) => d.isDefault);
  return (
    <Card className="anim-rise lg:col-span-2" style={{ ['--i' as string]: 3 }}>
      <CardHeader><CardTitle>{t('forOrganization')}</CardTitle><p className="text-xs text-muted">{t('organizationHint')}</p></CardHeader>
      <CardBody className="grid gap-4 md:grid-cols-[18rem_1fr]">
        {(designs.isPending || current.isPending) && <Skeleton className="h-10" />}
        {designs.isError && <ErrorAlert error={designs.error} />}
        {designs.data && current.data && (
          <>
            <Select aria-label={t('forOrganization')} value={current.data.themeKey ?? ''} disabled={set.isPending} onChange={(e) => set.mutate(e.target.value || null)}>
              <option value="">{t('followDefault', { name: defaultName })}</option>
              {designs.data.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </Select>
            {chosen && <div className="max-w-md"><DesignPreview design={chosen} mode="light" compact /></div>}
          </>
        )}
      </CardBody>
    </Card>
  );
}
