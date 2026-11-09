'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type NutritionVersion } from '@pt/api-client';
import { mealTotals, MEAL_TYPES, validateNutritionContent, type MealType, type NutritionDayInput, type PlanIssue } from '@pt/domain';
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { WEEKDAYS } from './labels';
import { NutritionAssignDialog } from './nutrition-assign-dialog';

interface EItem { key: string; name: string; quantity: string; unit: string; calories: string; protein: string; carbs: string; fat: string }
interface EMeal { key: string; mealType: MealType; time: string; notes: string; items: EItem[] }
interface EDay { key: string; weekday: number; notes: string; meals: EMeal[] }

let counter = 0;
const nextKey = () => `n${++counter}`;
const opt = (s: string) => (s.trim() === '' ? null : Number(s));
const blankItem = (): EItem => ({ key: nextKey(), name: '', quantity: '', unit: '', calories: '', protein: '', carbs: '', fat: '' });

const toEditable = (v: NutritionVersion): EDay[] =>
  v.days.map((d) => ({
    key: nextKey(), weekday: d.weekday, notes: d.notes ?? '',
    meals: d.meals.map((m) => ({
      key: nextKey(), mealType: m.mealType, time: m.timeOfDay ?? '', notes: m.notes ?? '',
      items: m.items.map((i) => ({ key: nextKey(), name: i.name, quantity: i.quantity === null ? '' : String(i.quantity), unit: i.unit ?? '', calories: i.calories === null ? '' : String(i.calories), protein: i.proteinG === null ? '' : String(i.proteinG), carbs: i.carbsG === null ? '' : String(i.carbsG), fat: i.fatG === null ? '' : String(i.fatG) })),
    })),
  }));

const toInput = (days: EDay[]): NutritionDayInput[] =>
  days.map((d) => ({
    weekday: d.weekday, notes: d.notes.trim() || null,
    meals: d.meals.map((m) => ({
      mealType: m.mealType, timeOfDay: m.time.trim() || null, notes: m.notes.trim() || null,
      items: m.items.map((i) => ({ name: i.name.trim(), quantity: opt(i.quantity), unit: i.unit.trim() || null, calories: opt(i.calories), proteinG: opt(i.protein), carbsG: opt(i.carbs), fatG: opt(i.fat) })),
    })),
  }));

const totalsOf = (day: EDay) => mealTotals(day.meals.flatMap((m) => m.items.map((i) => ({ calories: opt(i.calories), proteinG: opt(i.protein), carbsG: opt(i.carbs), fatG: opt(i.fat) }))));
const cloneDay = (d: EDay, weekday: number): EDay => ({ ...d, key: nextKey(), weekday, meals: d.meals.map((m) => ({ ...m, key: nextKey(), items: m.items.map((i) => ({ ...i, key: nextKey() })) })) });

function ReadOnlyVersion({ version }: { version: NutritionVersion }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  return (
    <div className="space-y-4">
      {version.notes && <p className="whitespace-pre-wrap text-sm text-ink-2">{version.notes}</p>}
      {version.days.map((d) => (
        <Card key={d.id}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{f(`weekday.d${d.weekday}` as 'weekday.d1')}</CardTitle>
            <span className="text-xs text-muted tabular-nums">{t('totals', { kcal: d.totals.calories, p: d.totals.proteinG, c: d.totals.carbsG, f: d.totals.fatG })}</span>
          </CardHeader>
          <ul className="divide-y divide-line">
            {d.meals.map((m) => (
              <li key={m.id} className="space-y-1 px-5 py-3 text-sm">
                <p className="font-medium">{t(`mealType.${m.mealType}`)}{m.timeOfDay ? <span className="ms-2 font-normal text-muted">{m.timeOfDay}</span> : null}</p>
                {m.items.map((i) => <p key={i.id} className="text-ink-2">{i.name}{i.quantity !== null ? ` · ${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : ''}{i.calories !== null ? ` · ${i.calories} kcal` : ''}</p>)}
                {m.notes && <p className="text-xs text-muted">{m.notes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function DraftEditor({ planId, version, hasPublished, onPublished }: { planId: string; version: NutritionVersion; hasPublished: boolean; onPublished: () => void }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [notes, setNotes] = useState(version.notes ?? '');
  const [days, setDays] = useState<EDay[]>(() => toEditable(version));
  const [dirty, setDirty] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<PlanIssue[]>([]);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);

  const edit = (fn: (d: EDay[]) => EDay[]) => { setDays(fn); setDirty(true); setServerIssues([]); };
  const patchDay = (di: number, patch: Partial<EDay>) => edit((all) => all.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  const patchMeal = (di: number, mi: number, patch: Partial<EMeal>) => edit((all) => all.map((d, i) => (i !== di ? d : { ...d, meals: d.meals.map((m, j) => (j === mi ? { ...m, ...patch } : m)) })));
  const patchItem = (di: number, mi: number, ii: number, patch: Partial<EItem>) => edit((all) => all.map((d, i) => (i !== di ? d : { ...d, meals: d.meals.map((m, j) => (j !== mi ? m : { ...m, items: m.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) })) })));
  const issues = [...validateNutritionContent(toInput(days), { forPublish: true }), ...serverIssues];
  const issuesAt = (prefix: string) => (showIssues ? issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`)) : []);
  const label = (rule: string) => (t.has(`rule.${rule}` as 'rule.range') ? t(`rule.${rule}` as 'rule.range') : t('rule.invalid'));

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans') }); };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'PLAN_INVALID') { setServerIssues(e.issues); setShowIssues(true); }
    toast(errorMessage(e), 'error');
  };
  const content = () => ({ notes: notes.trim() || null, days: toInput(days) });
  const save = useMutation({ mutationFn: () => api.org(orgId).fitness.nutrition.plans.saveContent(planId, version.id, content()), onSuccess: async () => { setDirty(false); await refresh(); toast(t('draftSaved')); }, onError });
  const publish = useMutation({
    mutationFn: async () => { await api.org(orgId).fitness.nutrition.plans.saveContent(planId, version.id, content()); return api.org(orgId).fitness.nutrition.plans.publish(planId, version.id); },
    onSuccess: async () => { setDirty(false); await refresh(); toast(t('published')); onPublished(); }, onError,
  });
  const discard = useMutation({ mutationFn: () => api.org(orgId).fitness.nutrition.plans.discardDraft(planId, version.id), onSuccess: async () => { await refresh(); toast(t('draftDiscarded')); onPublished(); }, onError: (e) => toast(errorMessage(e), 'error') });

  const used = new Set(days.map((d) => d.weekday));
  const free = WEEKDAYS.filter((w) => !used.has(w));
  const cell = 'h-9';

  return (
    <div className="space-y-4">
      <Card><CardBody>
        <Field label={t('versionNotes')} optionalLabel={f('optional')}>{(c) => <Textarea {...c} rows={2} maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />}</Field>
      </CardBody></Card>

      {days.map((day, di) => {
        const totals = totalsOf(day);
        const dayIssues = issuesAt(`days[${di}]`).filter((i) => i.path === `days[${di}].weekday` || i.path === `days[${di}].meals`);
        return (
          <Card key={day.key}>
            <CardHeader className="flex-row flex-wrap items-center gap-2">
              <Select aria-label={t('weekday')} value={day.weekday} onChange={(e) => patchDay(di, { weekday: Number(e.target.value) })} className="h-9 w-44">
                {WEEKDAYS.filter((w) => w === day.weekday || !used.has(w)).map((w) => <option key={w} value={w}>{f(`weekday.d${w}` as 'weekday.d1')}</option>)}
              </Select>
              <span className="text-xs text-muted tabular-nums">{t('totals', { kcal: totals.calories, p: totals.proteinG, c: totals.carbsG, f: totals.fatG })}</span>
              <span className="ms-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={free.length === 0} onClick={() => setCopyFrom(di)}><Copy className="size-4" aria-hidden />{t('copyDay')}</Button>
                <Button size="icon" variant="ghost" aria-label={t('removeDay')} onClick={() => edit((all) => all.filter((_, i) => i !== di))}><Trash2 className="size-4" aria-hidden /></Button>
              </span>
            </CardHeader>
            {dayIssues.length > 0 && <p role="alert" className="px-5 pt-3 text-xs font-medium text-danger">{dayIssues.map((i) => label(i.rule)).join(' · ')}</p>}
            <div className="divide-y divide-line">
              {day.meals.map((meal, mi) => {
                const mealIssues = issuesAt(`days[${di}].meals[${mi}]`);
                return (
                  <div key={meal.key} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="space-y-1 text-xs text-muted"><span className="block">{t('mealTypeLabel')}</span>
                        <Select value={meal.mealType} onChange={(e) => patchMeal(di, mi, { mealType: e.target.value as MealType })} className={`${cell} w-40`}>{MEAL_TYPES.map((m) => <option key={m} value={m}>{t(`mealType.${m}`)}</option>)}</Select>
                      </label>
                      <label className="space-y-1 text-xs text-muted"><span className="block">{t('time')}</span><Input type="time" value={meal.time} onChange={(e) => patchMeal(di, mi, { time: e.target.value })} className={`${cell} w-32`} /></label>
                      <label className="min-w-[10rem] flex-1 space-y-1 text-xs text-muted"><span className="block">{t('mealNotes')}</span><Input value={meal.notes} maxLength={500} onChange={(e) => patchMeal(di, mi, { notes: e.target.value })} className={cell} /></label>
                      <Button size="icon" variant="ghost" aria-label={t('removeMeal')} onClick={() => edit((all) => all.map((d, i) => (i === di ? { ...d, meals: d.meals.filter((_, j) => j !== mi) } : d)))}><Trash2 className="size-4" aria-hidden /></Button>
                    </div>
                    <div className="space-y-2">
                      {meal.items.map((item, ii) => (
                        <div key={item.key} className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[9rem] flex-1 space-y-1 text-xs text-muted"><span className="block">{t('itemName')}</span><Input value={item.name} maxLength={120} onChange={(e) => patchItem(di, mi, ii, { name: e.target.value })} className={cell} /></label>
                          {([['quantity', 'quantity', 'w-20'], ['unit', 'unit', 'w-16'], ['calories', 'kcal', 'w-20'], ['protein', 'protein', 'w-16'], ['carbs', 'carbs', 'w-16'], ['fat', 'fat', 'w-16']] as const).map(([field, labelKey, w]) => (
                            <label key={field} className="space-y-1 text-xs text-muted"><span className="block">{t(labelKey)}</span>
                              <Input type={field === 'unit' ? 'text' : 'number'} inputMode="decimal" min={0} step={field === 'quantity' ? '0.1' : '1'} maxLength={field === 'unit' ? 20 : undefined} value={item[field]} onChange={(e) => patchItem(di, mi, ii, { [field]: e.target.value })} className={`${cell} ${w}`} />
                            </label>
                          ))}
                          <Button size="icon" variant="ghost" aria-label={t('removeItem')} onClick={() => patchMeal(di, mi, { items: meal.items.filter((_, k) => k !== ii) })}><Trash2 className="size-4" aria-hidden /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => patchMeal(di, mi, { items: [...meal.items, blankItem()] })}><Plus className="size-4" aria-hidden />{t('addItem')}</Button>
                    </div>
                    {mealIssues.length > 0 && <p role="alert" className="text-xs font-medium text-danger">{[...new Set(mealIssues.map((i) => label(i.rule)))].join(' · ')}</p>}
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3"><Button size="sm" variant="secondary" onClick={() => patchDay(di, { meals: [...day.meals, { key: nextKey(), mealType: 'SNACK' as MealType, time: '', notes: '', items: [blankItem()] }] })}><Plus className="size-4" aria-hidden />{t('addMeal')}</Button></div>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={free.length === 0} onClick={() => edit((all) => [...all, { key: nextKey(), weekday: free[0]!, notes: '', meals: [{ key: nextKey(), mealType: 'BREAKFAST' as MealType, time: '', notes: '', items: [blankItem()] }] }].sort((a, b) => a.weekday - b.weekday))}><Plus className="size-4" aria-hidden />{t('addDay')}</Button>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {hasPublished && <ConfirmButton size="sm" confirmLabel={f('confirmAgain')} onConfirm={() => discard.mutate()}>{t('discardDraft')}</ConfirmButton>}
          <Button variant="secondary" loading={save.isPending} disabled={!dirty} onClick={() => { setShowIssues(false); save.mutate(); }}>{t('saveDraft')}</Button>
          <Button loading={publish.isPending} onClick={() => { setShowIssues(true); if (validateNutritionContent(toInput(days), { forPublish: true }).length === 0) publish.mutate(); else toast(t('fixIssues'), 'error'); }}>{t('publish')}</Button>
        </span>
      </div>
      {showIssues && issues.length > 0 && <p role="alert" className="text-sm font-medium text-danger">{t('fixIssues')}</p>}

      {copyFrom !== null && (
        <CopyDayDialog free={free} onClose={() => setCopyFrom(null)} onCopy={(targets) => { const src = days[copyFrom]!; edit((all) => [...all, ...targets.map((w) => cloneDay(src, w))].sort((a, b) => a.weekday - b.weekday)); setCopyFrom(null); }} />
      )}
    </div>
  );
}

function CopyDayDialog({ free, onClose, onCopy }: { free: number[]; onClose: () => void; onCopy: (weekdays: number[]) => void }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  const [picked, setPicked] = useState<number[]>(free);
  return (
    <Dialog open onClose={onClose} title={t('copyDay')} description={t('copyHint')}>
      <div className="space-y-3">
        {free.map((w) => <Checkbox key={w} label={f(`weekday.d${w}` as 'weekday.d1')} checked={picked.includes(w)} onChange={() => setPicked(picked.includes(w) ? picked.filter((x) => x !== w) : [...picked, w])} />)}
        <Button className="w-full" disabled={picked.length === 0} onClick={() => onCopy(picked)}>{t('copy')}</Button>
      </div>
    </Dialog>
  );
}

function RenameDialog({ planId, name, description, onClose }: { planId: string; name: string; description: string | null; onClose: () => void }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  const queryClient = useQueryClient();
  const toast = useToast();
  const { orgId } = useOrg();
  const [n, setN] = useState(name);
  const [d, setD] = useState(description ?? '');
  const save = useMutation({ mutationFn: () => api.org(orgId).fitness.nutrition.plans.update(planId, { name: n.trim(), description: d.trim() }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans') }); toast(t('saved')); onClose(); } });
  return (
    <Dialog open onClose={onClose} title={t('editTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <Field label={t('name')}>{(c) => <Input {...c} value={n} onChange={(e) => setN(e.target.value)} maxLength={120} autoFocus />}</Field>
        <Field label={t('description')} optionalLabel={f('optional')}>{(c) => <Input {...c} value={d} onChange={(e) => setD(e.target.value)} maxLength={1000} />}</Field>
        <Button type="submit" loading={save.isPending} disabled={n.trim().length < 2} className="w-full">{f('save')}</Button>
      </form>
    </Dialog>
  );
}

export function NutritionPlanEditor({ planId }: { planId: string }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can } = useOrg();
  const [picked, setPicked] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const detail = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans', planId), queryFn: () => api.org(orgId).fitness.nutrition.plans.get(planId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const versionId = picked ?? detail.data?.draftVersionId ?? detail.data?.currentVersion?.id ?? null;
  const version = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans', planId, 'version', versionId), queryFn: () => api.org(orgId).fitness.nutrition.plans.getVersion(planId, versionId!), enabled: Boolean(versionId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans') });
  const newVersion = useMutation({ mutationFn: () => api.org(orgId).fitness.nutrition.plans.createVersion(planId), onSuccess: async (v) => { await refresh(); setPicked(v.id); toast(t('draftCreated')); }, onError: (e) => toast(errorMessage(e), 'error') });
  const archive = useMutation({ mutationFn: () => api.org(orgId).fitness.nutrition.plans.archive(planId), onSuccess: async () => { await refresh(); toast(t('archivedToast')); router.replace(`/o/${slug}/nutrition-plans`); }, onError: (e) => toast(errorMessage(e), 'error') });

  if (detail.isPending) return <Skeleton className="h-64" />;
  if (detail.isError) return <div className="space-y-4"><ErrorAlert error={detail.error} /><Link href={`/o/${slug}/nutrition-plans`} className="text-sm font-medium text-link hover:underline">{t('back')}</Link></div>;
  const p = detail.data;

  return (
    <>
      <Link href={`/o/${slug}/nutrition-plans`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader title={p.name} description={p.description ?? f('plans.createdBy', { name: p.createdByName })} actions={!p.archived && (
        <>
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>{f('edit')}</Button>
          {can('fitness.nutrition_plan.assign') && p.currentVersion && <Button size="sm" onClick={() => setAssigning(true)}>{t('assign')}</Button>}
          <ConfirmButton size="sm" confirmLabel={f('confirmAgain')} onConfirm={() => archive.mutate()}>{t('archive')}</ConfirmButton>
        </>
      )} />
      {p.archived && <p className="mb-4 text-sm text-muted">{t('archivedNotice')}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label={t('version')} value={versionId ?? ''} onChange={(e) => setPicked(e.target.value)} className="h-9 w-72">
          {[...p.versions].reverse().map((v) => <option key={v.id} value={v.id}>{v.publishedAt ? t('versionPublished', { n: v.versionNo, date: format.dateTime(new Date(v.publishedAt), { dateStyle: 'medium' }) }) : t('versionDraft', { n: v.versionNo })}</option>)}
        </Select>
        {version.data && (version.data.published ? <Badge tone="ok">{t('lockedBadge')}</Badge> : <Badge tone="accent">{t('draftBadge')}</Badge>)}
        {p.currentVersion && p.currentVersion.id === versionId && <Badge>{t('currentBadge')}</Badge>}
        {!p.archived && !p.draftVersionId && p.currentVersion && <Button size="sm" variant="secondary" loading={newVersion.isPending} onClick={() => newVersion.mutate()}>{t('newVersion')}</Button>}
      </div>
      {version.data?.published && <p className="mb-4 text-sm text-muted">{t('lockedHint')}</p>}
      {version.isPending && versionId && <Skeleton className="h-48" />}
      {version.isError && <ErrorAlert error={version.error} />}
      {version.data && (version.data.published || p.archived ? <ReadOnlyVersion version={version.data} /> : <DraftEditor key={version.data.id} planId={planId} version={version.data} hasPublished={Boolean(p.currentVersion)} onPublished={() => setPicked(null)} />)}
      {assigning && <NutritionAssignDialog planId={planId} onClose={() => setAssigning(false)} />}
      {renaming && <RenameDialog planId={planId} name={p.name} description={p.description} onClose={() => setRenaming(false)} />}
    </>
  );
}

