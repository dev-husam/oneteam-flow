'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssigneeStatus, Task, TaskPriority, TaskStatus } from '@pt/api-client';
import { isOverdue } from '@pt/domain';
import { CalendarClock, Check, ListChecks, MessageSquare, Paperclip } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { cn } from '@/lib/cn';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { fromDateInput } from './dates';

export const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
export const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_TONE = { LOW: 'neutral', MEDIUM: 'accent', HIGH: 'warn', URGENT: 'danger' } as const;
const STATUS_TONE = { OPEN: 'neutral', IN_PROGRESS: 'accent', DONE: 'ok', CANCELLED: 'neutral' } as const;

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const t = useTranslations('tasks');
  return <Badge tone={PRIORITY_TONE[priority]}>{t(`priority.${priority}` as 'priority.LOW')}</Badge>;
}
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const t = useTranslations('tasks');
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}` as 'status.OPEN')}</Badge>;
}

export function DueLabel({ task }: { task: Pick<Task, 'dueAt' | 'status'> }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  if (!task.dueAt) return null;
  const late = isOverdue(task.dueAt, task.status);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', late ? 'font-medium text-danger' : 'text-muted')}>
      <CalendarClock className="size-3.5" aria-hidden />
      {t('dueOn', { date: format.dateTime(new Date(task.dueAt), { dateStyle: 'medium' }) })}
      {late && <span className="sr-only"> ({t('overdue')})</span>}
    </span>
  );
}

function TaskFormDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId, can } = useOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [due, setDue] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const members = useQuery({ queryKey: orgKey(orgId, 'members', 'assignable'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: can('member.read') });
  const groupList = useQuery({ queryKey: orgKey(orgId, 'groups', 'assignable'), queryFn: () => api.org(orgId).groups.list({ limit: 100 }), enabled: can('group.read') });
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const create = useMutation({
    mutationFn: () =>
      api.org(orgId).tasks.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueAt: due ? fromDateInput(due) : undefined,
        assigneeMembershipIds: people.length ? people : undefined,
        groupIds: groups.length ? groups : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') });
      toast(t('created'));
      onClose();
    },
  });

  return (
    <Dialog open onClose={onClose} title={t('createTitle')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        {create.isError && <ErrorAlert error={create.error} />}
        <Field label={t('fieldTitle')}>{(c) => <Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />}</Field>
        <Field label={t('fieldDescription')} optionalLabel={t('optional')}>
          {(c) => <Textarea {...c} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldPriority')}>
            {(c) => (
              <Select {...c} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as 'priority.LOW')}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t('fieldDue')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        </div>
        {(can('member.read') || can('group.read')) && (
          <div className="space-y-3">
            <p className="text-xs text-muted">{t('assigneesHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {can('member.read') && (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-sm font-medium text-ink-2">{t('fieldAssignees')}</legend>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                    {members.data?.data.map((m) => <Checkbox key={m.id} label={m.fullName} checked={people.includes(m.id)} onChange={() => toggle(people, setPeople, m.id)} />)}
                  </div>
                </fieldset>
              )}
              {can('group.read') && (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-sm font-medium text-ink-2">{t('fieldGroups')}</legend>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-line p-3">
                    {groupList.data?.data.map((g) => <Checkbox key={g.id} label={g.name} checked={groups.includes(g.id)} onChange={() => toggle(groups, setGroups, g.id)} />)}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        )}
        <Button type="submit" loading={create.isPending} disabled={title.trim().length < 2} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

function TaskRow({ task }: { task: Task }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can } = useOrg();
  const done = task.assignees.filter((a) => a.status === 'DONE').length;
  const canToggle = task.myStatus !== null && task.status !== 'CANCELLED' && can('task.update_status');
  const toggle = useMutation({
    mutationFn: () => api.org(orgId).tasks.setStatus(task.id, task.myStatus === 'DONE' ? 'PENDING' : 'DONE'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <li className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-2">
      {canToggle ? (
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          aria-pressed={task.myStatus === 'DONE'}
          aria-label={t(`myStatus.${(task.myStatus === 'DONE' ? 'PENDING' : 'DONE') as AssigneeStatus}` as 'myStatus.DONE')}
          className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border', task.myStatus === 'DONE' ? 'border-ok bg-ok text-ok-soft' : 'border-line hover:border-focus')}
        >
          {task.myStatus === 'DONE' && <Check className="size-4" aria-hidden />}
        </button>
      ) : (
        <span className="mt-0.5 size-6 shrink-0" aria-hidden />
      )}
      <Link href={`/o/${slug}/tasks/${task.id}`} className="min-w-0 flex-1">
        <span className={cn('block font-medium', task.status === 'DONE' || task.status === 'CANCELLED' ? 'text-muted line-through' : '')}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DueLabel task={task} />
          {task.assignees.length > 0 && <span className="text-xs text-muted">{t('progressOf', { done, total: task.assignees.length })}</span>}
          {task.commentCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted"><MessageSquare className="size-3.5" aria-hidden />{task.commentCount}</span>}
          {task.attachmentCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted"><Paperclip className="size-3.5" aria-hidden />{task.attachmentCount}</span>}
        </span>
      </Link>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <PriorityBadge priority={task.priority} />
        <TaskStatusBadge status={task.status} />
      </span>
    </li>
  );
}

export function TasksPage() {
  const t = useTranslations('tasks');
  const { orgId, can } = useOrg();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const search = useDebounced(q.trim());
  const filtered = Boolean(search || status || priority || mine || overdue);
  const list = useCursorList(orgKey(orgId, 'tasks', 'list', search, status, priority, mine, overdue), (cursor) =>
    api.org(orgId).tasks.list({ q: search || undefined, status: status || undefined, priority: priority || undefined, assignee: mine ? 'me' : undefined, overdue: overdue || undefined, cursor, limit: 25 }),
  );

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={can('task.create') && <Button onClick={() => setCreating(true)}>{t('create')}</Button>} />
      <Card className="anim-rise">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap gap-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('search')} className="w-full sm:max-w-xs" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | '')} aria-label={t('filterStatus')} className="w-full sm:w-44">
              <option value="">{t('allStatuses')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as 'status.OPEN')}</option>)}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | '')} aria-label={t('filterPriority')} className="w-full sm:w-44">
              <option value="">{t('allPriorities')}</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as 'priority.LOW')}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox label={t('assignedToMe')} checked={mine} onChange={(e) => setMine(e.target.checked)} />
            <Checkbox label={t('overdueOnly')} checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          </div>
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && (
          <EmptyState icon={ListChecks} title={filtered ? t('emptyFiltered') : t('empty')}>{filtered ? t('emptyFilteredBody') : t('emptyBody')}</EmptyState>
        )}
        {list.items.length > 0 && <ul className="divide-y divide-line">{list.items.map((task) => <TaskRow key={task.id} task={task} />)}</ul>}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
      {creating && <TaskFormDialog onClose={() => setCreating(false)} />}
    </>
  );
}
