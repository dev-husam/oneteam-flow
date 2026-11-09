'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Assigns a published nutrition plan to clients and/or groups. `planId` fixes the plan, `clientId` the client. */
export function NutritionAssignDialog({ planId: fixedPlanId, clientId, onClose }: { planId?: string; clientId?: string; onClose: () => void }) {
  const t = useTranslations('nutrition');
  const f = useTranslations('fitness');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [planPick, setPlanPick] = useState('');
  const [people, setPeople] = useState<string[]>(clientId ? [clientId] : []);
  const [groups, setGroups] = useState<string[]>([]);
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState('');
  const plans = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition-plans', 'assignable'), queryFn: () => api.org(orgId).fitness.nutrition.plans.list({ limit: 100 }), enabled: !fixedPlanId });
  const clients = useQuery({ queryKey: orgKey(orgId, 'fitness', 'clients', 'assignable'), queryFn: () => api.org(orgId).fitness.clients.list({ limit: 100 }), enabled: !clientId });
  const groupList = useQuery({ queryKey: orgKey(orgId, 'groups', 'assignable'), queryFn: () => api.org(orgId).groups.list({ limit: 100 }), enabled: !clientId && can('group.read') });
  const planId = fixedPlanId ?? planPick;
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const assign = useMutation({
    mutationFn: () => api.org(orgId).fitness.nutrition.plans.assign(planId, { clientMembershipIds: people.length ? people : undefined, groupIds: groups.length ? groups : undefined, startDate: start, endDate: end || undefined }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') });
      toast(res.skipped > 0 ? f('assign.doneSkipped', { count: res.assignments.length, skipped: res.skipped }) : f('assign.done', { count: res.assignments.length }));
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title={t('assignTitle')} description={t('assignSubtitle')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
        {assign.isError && <ErrorAlert error={assign.error} />}
        {!fixedPlanId && (
          <Field label={t('plan')}>{(c) => (
            <Select {...c} value={planPick} onChange={(e) => setPlanPick(e.target.value)}>
              <option value="">{t('choosePlan')}</option>
              {plans.data?.data.filter((p) => p.currentVersion).map((p) => <option key={p.id} value={p.id}>{p.name} (v{p.currentVersion!.versionNo})</option>)}
            </Select>
          )}</Field>
        )}
        {!clientId && (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2"><legend className="mb-1.5 text-sm font-medium text-ink-2">{f('assign.clients')}</legend>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-line p-3">{clients.data?.data.map((c) => <Checkbox key={c.membershipId} label={c.fullName} checked={people.includes(c.membershipId)} onChange={() => toggle(people, setPeople, c.membershipId)} />)}</div>
            </fieldset>
            {can('group.read') && (
              <fieldset className="space-y-2"><legend className="mb-1.5 text-sm font-medium text-ink-2">{f('assign.groups')}</legend>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-line p-3">{groupList.data?.data.map((g) => <Checkbox key={g.id} label={g.name} checked={groups.includes(g.id)} onChange={() => toggle(groups, setGroups, g.id)} />)}</div>
              </fieldset>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f('assign.start')}>{(c) => <Input {...c} type="date" min={todayInput()} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={f('assign.end')} optionalLabel={f('optional')}>{(c) => <Input {...c} type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <Button type="submit" loading={assign.isPending} disabled={!planId || (people.length === 0 && groups.length === 0) || !start} className="w-full">{t('assignSubmit')}</Button>
      </form>
    </Dialog>
  );
}
