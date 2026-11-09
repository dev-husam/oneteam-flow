'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Goal, MetricDefinition, MetricPoint } from '@pt/api-client';
import { Flag, LineChart as LineChartIcon, Plus, Target } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMetricName } from './metric-name';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { LineChart } from '@/components/ui/line-chart';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Today means "now" (the server rejects the future); any earlier day is recorded at local noon. */
const recordedAtOf = (value: string): string | undefined => (value === todayInput() ? undefined : new Date(`${value}T12:00:00`).toISOString());

function useNumberFormat(precision: number) {
  const format = useFormatter();
  return (v: number) => format.number(v, { maximumFractionDigits: precision });
}

function MetricDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('progress');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<'higher' | 'lower' | 'neutral'>('neutral');
  const keyValid = /^[a-z][a-z0-9_]{1,58}$/.test(key);
  const create = useMutation({
    mutationFn: () => api.org(orgId).progress.metrics.create({ key, name: name.trim(), unit: unit.trim(), higherIsBetter: direction === 'neutral' ? undefined : direction === 'higher' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress', 'metrics') }); toast(t('metricSaved')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={t('newMetric')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.isError && <ErrorAlert error={create.error} />}
        <Field label={t('metricName')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />}</Field>
        <Field label={t('metricKey')} hint={t('metricKeyHint')} error={key && !keyValid ? t('metricKeyHint') : undefined}>
          {(c) => <Input {...c} dir="ltr" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} maxLength={59} />}
        </Field>
        <Field label={t('metricUnit')}>{(c) => <Input {...c} value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} />}</Field>
        <Field label={t('metricDirection')}>
          {(c) => (
            <Select {...c} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
              <option value="neutral">{t('directionNeutral')}</option>
              <option value="higher">{t('directionHigher')}</option>
              <option value="lower">{t('directionLower')}</option>
            </Select>
          )}
        </Field>
        <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2 || !unit.trim() || !keyValid} className="w-full">{t('add')}</Button>
      </form>
    </Dialog>
  );
}

function GoalDialog({ subjectMembershipId, metrics, onClose }: { subjectMembershipId: string; metrics: MetricDefinition[]; onClose: () => void }) {
  const t = useTranslations('progress');
  const metricName = useMetricName();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [title, setTitle] = useState('');
  const [metricId, setMetricId] = useState('');
  const [baseline, setBaseline] = useState('');
  const [target, setTarget] = useState('');
  const [due, setDue] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.org(orgId).progress.goals.create({
        subjectMembershipId,
        title: title.trim(),
        metricId: metricId || undefined,
        baselineValue: metricId && baseline !== '' ? Number(baseline) : undefined,
        targetValue: metricId && target !== '' ? Number(target) : undefined,
        dueDate: due || undefined,
      }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress', 'goals') }); toast(t('goalSaved')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={t('newGoal')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.isError && <ErrorAlert error={create.error} />}
        <Field label={t('goalTitle')}>{(c) => <Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />}</Field>
        <Field label={t('goalMetric')}>
          {(c) => (
            <Select {...c} value={metricId} onChange={(e) => setMetricId(e.target.value)}>
              <option value="">{t('goalNoMetric')}</option>
              {metrics.map((m) => <option key={m.id} value={m.id}>{metricName(m)} ({m.unit})</option>)}
            </Select>
          )}
        </Field>
        {metricId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('baseline')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="number" step="any" inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} />}</Field>
            <Field label={t('target')}>{(c) => <Input {...c} type="number" step="any" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
          </div>
        )}
        <Field label={t('dueDate')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        <Button type="submit" loading={create.isPending} disabled={title.trim().length < 2 || (Boolean(metricId) && target === '')} className="w-full">{t('add')}</Button>
      </form>
    </Dialog>
  );
}

function GoalCard({ goal, metric, canManage }: { goal: Goal; metric?: MetricDefinition; canManage: boolean }) {
  const t = useTranslations('progress');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [milestone, setMilestone] = useState('');
  const num = useNumberFormat(metric?.precision ?? 2);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress', 'goals') });
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const add = useMutation({ mutationFn: () => api.org(orgId).progress.goals.addMilestone(goal.id, { title: milestone.trim() }), onSuccess: async () => { setMilestone(''); await refresh(); }, onError: fail });
  const achieve = useMutation({ mutationFn: (id: string) => api.org(orgId).progress.goals.achieveMilestone(goal.id, id), onSuccess: refresh, onError: fail });
  const abandon = useMutation({ mutationFn: () => api.org(orgId).progress.goals.update(goal.id, { status: 'ABANDONED' }), onSuccess: refresh, onError: fail });
  const percent = goal.progress === null ? null : Math.round(goal.progress * 100);

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{goal.title}</p>
          {goal.metricId && goal.targetValue !== null && metric && (
            <p className="text-sm text-muted">
              {goal.baselineValue !== null && `${num(goal.baselineValue)} → `}{num(goal.targetValue)} {metric.unit}
              {goal.currentValue !== null && ` · ${num(goal.currentValue)} ${metric.unit}`}
            </p>
          )}
          {goal.dueDate && <p className="text-xs text-muted">{t('dueDate')}: {format.dateTime(new Date(goal.dueDate), { dateStyle: 'medium' })}</p>}
        </div>
        <Badge tone={goal.status === 'ACHIEVED' ? 'ok' : goal.status === 'ABANDONED' ? 'neutral' : 'accent'}>{t(`goalStatus.${goal.status}` as 'goalStatus.ACTIVE')}</Badge>
      </div>
      {percent !== null && (
        <div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={goal.title} className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full', goal.status === 'ACHIEVED' ? 'bg-ok' : 'bg-accent')} style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{t('goalProgress', { percent })}</p>
        </div>
      )}
      {(goal.milestones.length > 0 || (canManage && goal.status === 'ACTIVE')) && (
        <div className="space-y-2">
          {goal.milestones.length > 0 && <p className="text-xs font-medium uppercase tracking-wide text-muted">{t('milestones')}</p>}
          <ul className="space-y-1.5">
            {goal.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Flag className={cn('size-4 shrink-0', m.achievedAt ? 'text-ok' : 'text-muted')} aria-hidden />
                <span className={cn('min-w-0 flex-1', m.achievedAt && 'text-muted line-through')}>{m.title}</span>
                {m.achievedAt ? <Badge tone="ok">{t('reached')}</Badge> : canManage && goal.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => achieve.mutate(m.id)}>{t('achieve')}</Button>}
              </li>
            ))}
          </ul>
          {canManage && goal.status === 'ACTIVE' && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (milestone.trim().length >= 2) add.mutate(); }}>
              <Input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder={t('milestoneTitle')} aria-label={t('addMilestone')} className="h-9" maxLength={200} />
              <Button type="submit" size="sm" variant="secondary" loading={add.isPending} disabled={milestone.trim().length < 2}>{t('add')}</Button>
            </form>
          )}
        </div>
      )}
      {canManage && goal.status === 'ACTIVE' && <Button size="sm" variant="ghost" loading={abandon.isPending} onClick={() => abandon.mutate()}>{t('abandon')}</Button>}
    </li>
  );
}

function VoidDialog({ point, metric, onClose }: { point: MetricPoint; metric: MetricDefinition; onClose: () => void }) {
  const t = useTranslations('progress');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const num = useNumberFormat(metric.precision);
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => api.org(orgId).progress.records.void(point.id, reason.trim()),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress') }); toast(t('voided')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={`${t('voidEntry')}: ${num(point.value)} ${metric.unit}`} description={t('voidHint')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
        {run.isError && <ErrorAlert error={run.error} />}
        <Field label={t('voidReason')}>{(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />}</Field>
        <Button type="submit" variant="danger" loading={run.isPending} disabled={reason.trim().length < 2} className="w-full">{t('voidConfirm')}</Button>
      </form>
    </Dialog>
  );
}

export function ProgressPage() {
  const t = useTranslations('progress');
  const metricName = useMetricName();
  const format = useFormatter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId, can, membershipId } = useOrg();
  // /progress?person=<membershipId> opens on that person (linked from the client page)
  const [subjectPick, setSubject] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('person') ?? '')));
  const [metricPick, setMetric] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayInput);
  const [dialog, setDialog] = useState<'metric' | 'goal' | null>(null);
  const [voiding, setVoiding] = useState<MetricPoint | null>(null);

  const people = useQuery({ queryKey: orgKey(orgId, 'members', 'progress'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: can('member.read') });
  const metrics = useQuery({ queryKey: orgKey(orgId, 'progress', 'metrics'), queryFn: () => api.org(orgId).progress.metrics.list() });

  const personOptions = people.data?.data.map((m) => ({ id: m.id, name: m.fullName })) ?? [];
  // Staff open on the first person they look after; a client only ever sees themself.
  const subject = subjectPick || (personOptions.find((p) => p.id !== membershipId)?.id ?? membershipId);
  const ready = !can('member.read') || people.isSuccess;
  const metricId = metricPick || metrics.data?.[0]?.id || '';
  const metric = metrics.data?.find((m) => m.id === metricId);
  const num = useNumberFormat(metric?.precision ?? 2);

  const summary = useQuery({
    queryKey: orgKey(orgId, 'progress', 'summary', subject, metricId),
    queryFn: () => api.org(orgId).progress.summary({ subjectMembershipId: subject, metricId }),
    enabled: Boolean(metricId) && ready,
  });
  const goals = useQuery({ queryKey: orgKey(orgId, 'progress', 'goals', subject), queryFn: () => api.org(orgId).progress.goals.list({ subjectMembershipId: subject }), enabled: ready });
  const activeGoal = goals.data?.find((g) => g.metricId === metricId && g.status === 'ACTIVE');

  const record = useMutation({
    mutationFn: () => api.org(orgId).progress.records.create({ subjectMembershipId: subject, metricId, value: Number(value), recordedAt: recordedAtOf(date) }),
    onSuccess: async () => {
      setValue('');
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress') });
      toast(t('recorded'));
    },
  });

  if (metrics.isPending || !ready) return <Skeleton className="h-64" />;
  if (metrics.isError) return <ErrorAlert error={metrics.error} />;
  const s = summary.data?.summary;
  const trendKey = s?.improved === true ? 'trendGood' : s?.improved === false ? 'trendBad' : 'trendNeutral';
  const futureDate = date > todayInput();

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('metric.manage') && <Button variant="secondary" onClick={() => setDialog('metric')}><Plus className="size-4" aria-hidden />{t('newMetric')}</Button>} />

      {metrics.data.length === 0 ? (
        <Card><EmptyState icon={LineChartIcon} title={t('noMetrics')}>{t('noMetricsBody')}</EmptyState></Card>
      ) : (
        <div className="space-y-6">
          <Card className="anim-rise">
            <div className="flex flex-wrap gap-3 border-b border-line p-4">
              {can('member.read') && personOptions.length > 1 && (
                <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t('person')} className="w-full sm:w-60">
                  {personOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
              <Select value={metricId} onChange={(e) => setMetric(e.target.value)} aria-label={t('metric')} className="w-full sm:w-60">
                {metrics.data.map((m) => <option key={m.id} value={m.id}>{metricName(m)} ({m.unit})</option>)}
              </Select>
            </div>
            <CardBody className="space-y-5">
              {summary.isPending && <Skeleton className="h-56" />}
              {summary.isError && <ErrorAlert error={summary.error} />}
              {metric && summary.data && summary.data.points.length === 0 && <EmptyState icon={LineChartIcon} title={t('noData')}>{can('progress.record') ? t('noDataBody') : undefined}</EmptyState>}
              {metric && summary.data && s && summary.data.points.length > 0 && (
                <>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                    {([
                      ['first', s.first?.value],
                      ['latest', s.latest?.value],
                      ['change', s.change],
                      ['lowest', s.min],
                      ['highest', s.max],
                    ] as const).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-muted">{t(k)}</dt>
                        <dd className="text-lg font-semibold tabular-nums">{v == null ? '—' : `${k === 'change' && v > 0 ? '+' : ''}${num(v)}`} <span className="text-xs font-normal text-muted">{metric.unit}</span></dd>
                      </div>
                    ))}
                  </dl>
                  {s.change !== null && s.change !== 0 && <p className={cn('text-sm', s.improved === true ? 'text-ok' : s.improved === false ? 'text-danger' : 'text-muted')}>{t(trendKey)}</p>}
                  <LineChart
                    points={summary.data.points.map((p) => ({ at: p.recordedAt, value: p.value }))}
                    label={t('chartLabel', { metric: metricName(metric) })}
                    unit={metric.unit}
                    target={activeGoal?.targetValue ?? null}
                    formatDate={(iso) => format.dateTime(new Date(iso), { dateStyle: 'medium' })}
                    formatValue={num}
                  />
                </>
              )}
            </CardBody>
          </Card>

          {can('progress.record') && metric && (
            <Card className="anim-rise">
              <CardHeader><CardTitle>{t('record')}</CardTitle></CardHeader>
              <CardBody>
                <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (value !== '' && !futureDate) record.mutate(); }}>
                  <Field label={`${t('value')} (${metric.unit})`} className="w-40">{(c) => <Input {...c} type="number" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
                  <Field label={t('recordedOn')} className="w-48" error={futureDate ? t('futureDate') : undefined}>{(c) => <Input {...c} type="date" max={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
                  <Button type="submit" loading={record.isPending} disabled={value === '' || futureDate || !date}>{t('add')}</Button>
                </form>
                {record.isError && <div className="mt-3"><ErrorAlert error={record.error} /></div>}
              </CardBody>
            </Card>
          )}

          {metric && summary.data && summary.data.points.length > 0 && (
            <Card className="anim-rise">
              <CardHeader><CardTitle>{t('recordsTitle')} <Badge className="ms-2">{summary.data.points.length}</Badge></CardTitle></CardHeader>
              <ul className="divide-y divide-line">
                {[...summary.data.points].reverse().map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                    <span className="w-28 font-semibold tabular-nums">{num(p.value)} {metric.unit}</span>
                    <span className="flex-1 text-muted">{t('recordedAt', { date: format.dateTime(new Date(p.recordedAt), { dateStyle: 'medium' }) })} · {t('by', { name: p.recordedByName })}</span>
                    {can('progress.record') && <Button size="sm" variant="ghost" onClick={() => setVoiding(p)}>{t('voidEntry')}</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="anim-rise">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>{t('goals')}</CardTitle>
              {can('goal.manage') && <Button size="sm" variant="secondary" onClick={() => setDialog('goal')}><Target className="size-4" aria-hidden />{t('newGoal')}</Button>}
            </CardHeader>
            {goals.isError && <div className="p-4"><ErrorAlert error={goals.error} /></div>}
            {goals.data?.length === 0 && <EmptyState icon={Target} title={t('noGoals')} />}
            <ul className="divide-y divide-line">
              {goals.data?.map((g) => <GoalCard key={g.id} goal={g} metric={metrics.data.find((m) => m.id === g.metricId)} canManage={can('goal.manage')} />)}
            </ul>
          </Card>
        </div>
      )}

      {dialog === 'metric' && <MetricDialog onClose={() => setDialog(null)} />}
      {dialog === 'goal' && <GoalDialog subjectMembershipId={subject} metrics={metrics.data ?? []} onClose={() => setDialog(null)} />}
      {voiding && metric && <VoidDialog point={voiding} metric={metric} onClose={() => setVoiding(null)} />}
    </>
  );
}
