'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scheduleIssues } from '@pt/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { WEEKDAYS } from './labels';

/** Sensible starting weekdays for plan days 1…7 (Mon/Wed/Fri first). */
const DEFAULT_WEEKDAYS = [1, 3, 5, 2, 4, 6, 7];

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Assigns a published plan to one or many clients (people and/or whole groups) with a start date and a weekly
 * schedule. `planId` fixes the plan; `clientId` fixes the client; otherwise the dialog asks for them.
 */
export function AssignDialog({ planId: fixedPlanId, clientId, onClose }: { planId?: string; clientId?: string; onClose: () => void }) {
  const t = useTranslations('fitness');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [planPick, setPlanPick] = useState('');
  const [people, setPeople] = useState<string[]>(clientId ? [clientId] : []);
  const [groups, setGroups] = useState<string[]>([]);
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState('');
  const [picked, setPicked] = useState<Record<string, number | ''>>({});

  const plans = useQuery({ queryKey: orgKey(orgId, 'fitness', 'plans', 'assignable'), queryFn: () => api.org(orgId).fitness.plans.list({ limit: 100 }), enabled: !fixedPlanId });
  const planId = fixedPlanId ?? planPick;
  const detail = useQuery({ queryKey: orgKey(orgId, 'fitness', 'plans', planId), queryFn: () => api.org(orgId).fitness.plans.get(planId), enabled: Boolean(planId) });
  const versionId = detail.data?.currentVersion?.id;
  const version = useQuery({ queryKey: orgKey(orgId, 'fitness', 'plans', planId, 'version', versionId), queryFn: () => api.org(orgId).fitness.plans.getVersion(planId, versionId!), enabled: Boolean(versionId) });
  const clients = useQuery({ queryKey: orgKey(orgId, 'fitness', 'clients', 'assignable'), queryFn: () => api.org(orgId).fitness.clients.list({ limit: 100 }), enabled: !clientId });
  const groupList = useQuery({ queryKey: orgKey(orgId, 'groups', 'assignable'), queryFn: () => api.org(orgId).groups.list({ limit: 100 }), enabled: !clientId && can('group.read') });

  const days = version.data?.days ?? [];
  // the weekday of each plan day: what the user chose, else a default; "" means "not scheduled"
  const weekdayOf = (dayIndex: number): number | '' => (dayIndex in picked ? picked[dayIndex]! : (DEFAULT_WEEKDAYS[dayIndex - 1] ?? ''));
  const schedule = Object.fromEntries(days.flatMap((d) => (weekdayOf(d.dayIndex) === '' ? [] : [[String(d.dayIndex), weekdayOf(d.dayIndex) as number]])));
  const scheduleBad = days.length > 0 && scheduleIssues(schedule, days.length).length > 0;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const assign = useMutation({
    mutationFn: () => api.org(orgId).fitness.plans.assign(planId, { versionId, clientMembershipIds: people.length ? people : undefined, groupIds: groups.length ? groups : undefined, startDate: start, endDate: end || undefined, weeklySchedule: schedule }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') });
      toast(res.skipped > 0 ? t('assign.doneSkipped', { count: res.assignments.length, skipped: res.skipped }) : t('assign.done', { count: res.assignments.length }));
      onClose();
    },
  });
  const canSubmit = Boolean(planId && versionId) && (people.length > 0 || groups.length > 0) && !scheduleBad && days.length > 0 && Boolean(start);

  return (
    <Dialog open onClose={onClose} title={t('assign.title')} description={t('assign.subtitle')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
        {assign.isError && <ErrorAlert error={assign.error} />}
        {!fixedPlanId && (
          <Field label={t('assign.plan')}>
            {(c) => (
              <Select {...c} value={planPick} onChange={(e) => setPlanPick(e.target.value)}>
                <option value="">{t('assign.choosePlan')}</option>
                {plans.data?.data.filter((p) => p.currentVersion).map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.currentVersion!.versionNo})</option>)}
              </Select>
            )}
          </Field>
        )}
        {planId && detail.data && !detail.data.currentVersion && <p className="text-sm text-danger">{t('assign.notPublished')}</p>}

        {!clientId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-2">{t('assign.clients')}</legend>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                {clients.data?.data.length === 0 && <p className="text-sm text-muted">{t('assign.noClients')}</p>}
                {clients.data?.data.map((c) => <Checkbox key={c.membershipId} label={c.fullName} checked={people.includes(c.membershipId)} onChange={() => toggle(people, setPeople, c.membershipId)} />)}
              </div>
            </fieldset>
            {can('group.read') && (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-medium text-ink-2">{t('assign.groups')}</legend>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                  {groupList.data?.data.map((g) => <Checkbox key={g.id} label={g.name} checked={groups.includes(g.id)} onChange={() => toggle(groups, setGroups, g.id)} />)}
                </div>
              </fieldset>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('assign.start')}>{(c) => <Input {...c} type="date" min={todayInput()} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={t('assign.end')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>

        {days.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-2">{t('assign.schedule')}</legend>
            <p className="text-xs text-muted">{t('assign.scheduleHint')}</p>
            <div className="space-y-2">
              {days.map((d) => (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{d.dayIndex}. {d.name}</span>
                  <Select aria-label={t('assign.weekdayFor', { day: d.name })} value={String(weekdayOf(d.dayIndex))} onChange={(e) => setPicked({ ...picked, [d.dayIndex]: e.target.value === '' ? '' : Number(e.target.value) })} className="h-9 w-44">
                    <option value="">{t('assign.notScheduled')}</option>
                    {WEEKDAYS.map((w) => <option key={w} value={w}>{t(`weekday.d${w}`)}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            {scheduleBad && <p role="alert" className="text-xs font-medium text-danger">{t('assign.scheduleInvalid')}</p>}
          </fieldset>
        )}
        <Button type="submit" loading={assign.isPending} disabled={!canSubmit} className="w-full">{t('assign.submit')}</Button>
      </form>
    </Dialog>
  );
}
