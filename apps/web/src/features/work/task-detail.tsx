'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type AssigneeStatus, type TaskDetail as TaskDetailData, type TaskPriority } from '@pt/api-client';
import { ArrowLeft, Download, Paperclip, Trash2, UserMinus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useCursorList } from '@/lib/use-cursor-list';
import { formatBytes, openStoredFile } from './download';
import { fromDateInput, toDateInput } from './dates';
import { DueLabel, PRIORITIES, PriorityBadge, TaskStatusBadge } from './tasks-page';
import { useActivityText } from './use-activity-text';

const MY_STATUSES: AssigneeStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE'];

function EditDialog({ task, onClose }: { task: TaskDetailData; onClose: () => void }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [due, setDue] = useState(toDateInput(task.dueAt));
  const save = useMutation({
    mutationFn: () =>
      api.org(orgId).tasks.update(task.id, {
        version: task.version,
        title: title.trim(),
        description: description.trim(),
        priority,
        dueAt: due ? fromDateInput(due) : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') });
      toast(t('saved'));
      onClose();
    },
    onError: async (e) => {
      // Someone else saved first: show the newest version instead of overwriting it.
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') });
        toast(t('conflict'), 'error');
        onClose();
      }
    },
  });
  return (
    <Dialog open onClose={onClose} title={t('editTitle')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && !(save.error instanceof ApiError && save.error.code === 'CONFLICT') && <ErrorAlert error={save.error} />}
        <Field label={t('fieldTitle')}>{(c) => <Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />}</Field>
        <Field label={t('fieldDescription')} optionalLabel={t('optional')}>
          {(c) => <Textarea {...c} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={4} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fieldPriority')}>
            {(c) => <Select {...c} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}` as 'priority.LOW')}</option>)}</Select>}
          </Field>
          <Field label={t('fieldDue')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        </div>
        <Button type="submit" loading={save.isPending} disabled={title.trim().length < 2} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

function Comments({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can, membershipId, scopeOf } = useOrg();
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const key = orgKey(orgId, 'tasks', taskId, 'comments');
  const list = useCursorList(key, (cursor) => api.org(orgId).tasks.comments.list(taskId, { cursor, limit: 20 }));
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks', taskId, 'history') });
  };
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const post = useMutation({ mutationFn: () => api.org(orgId).tasks.comments.add(taskId, body.trim()), onSuccess: async () => { setBody(''); await refresh(); }, onError: fail });
  const save = useMutation({ mutationFn: () => api.org(orgId).tasks.comments.edit(taskId, editing!.id, editing!.body.trim()), onSuccess: async () => { setEditing(null); await refresh(); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: string) => api.org(orgId).tasks.comments.remove(taskId, id), onSuccess: refresh, onError: fail });
  const moderator = scopeOf('task.manage') === 'ORG';

  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('comments')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {list.isError && <ErrorAlert error={list.error} />}
        {!list.isPending && list.items.length === 0 && <p className="text-sm text-muted">{t('noComments')}</p>}
        <ul className="space-y-4">
          {list.items.map((c) => (
            <li key={c.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{c.authorName}</span>
                <span className="text-xs text-muted">{format.dateTime(new Date(c.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {c.edited && <span className="text-xs text-muted">({t('edited')})</span>}
              </div>
              {editing?.id === c.id ? (
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                  <textarea aria-label={t('editComment')} value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} rows={3} maxLength={4000} className="w-full rounded-md border border-line bg-surface px-3 py-2" />
                  <div className="flex gap-2"><Button type="submit" size="sm" loading={save.isPending} disabled={!editing.body.trim()}>{t('save')}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('back')}</Button></div>
                </form>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{c.body}</p>
              )}
              {editing?.id !== c.id && (c.authorMembershipId === membershipId || moderator) && (
                <div className="flex gap-3 text-xs">
                  {c.authorMembershipId === membershipId && <button type="button" className="text-link hover:underline" onClick={() => setEditing({ id: c.id, body: c.body })}>{t('editComment')}</button>}
                  <button type="button" className="text-danger hover:underline" onClick={() => remove.mutate(c.id)}>{t('deleteComment')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
        {can('task.comment') && (
          <form className="space-y-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }}>
            <label className="sr-only" htmlFor="new-comment">{t('commentLabel')}</label>
            <textarea id="new-comment" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('commentPlaceholder')} rows={3} maxLength={4000} />
            <Button type="submit" size="sm" loading={post.isPending} disabled={!body.trim()}>{t('post')}</Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

function Attachments({ task }: { task: TaskDetailData }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, can, scopeOf } = useOrg();
  const input = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') });
  };
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const stored = await api.org(orgId).files.upload({ fileName: file.name, mimeType: file.type || 'application/octet-stream', body: file });
      await api.org(orgId).tasks.attach(task.id, stored.id);
    },
    onSuccess: refresh,
    onError: fail,
  });
  const detach = useMutation({ mutationFn: (fileId: string) => api.org(orgId).tasks.detach(task.id, fileId), onSuccess: refresh, onError: fail });
  const download = useMutation({ mutationFn: (fileId: string) => openStoredFile(orgId, fileId), onError: fail });
  const moderator = scopeOf('task.manage') === 'ORG';

  return (
    <Card className="anim-rise">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('attachments')}</CardTitle>
        {can('file.upload') && (
          <>
            <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
            <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}><Paperclip className="size-4" aria-hidden />{upload.isPending ? t('uploading') : t('attach')}</Button>
          </>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {task.attachments.length === 0 && <p className="text-sm text-muted">{t('noAttachments')}</p>}
        <ul className="divide-y divide-line">
          {task.attachments.map((a) => (
            <li key={a.fileId} className="flex items-center gap-3 py-2.5">
              <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span className="text-xs text-muted">{formatBytes(a.sizeBytes)}</span>
              <Button variant="ghost" size="icon" aria-label={t('download', { name: a.name })} onClick={() => download.mutate(a.fileId)}><Download className="size-4" aria-hidden /></Button>
              {(moderator || can('file.upload')) && <Button variant="ghost" size="icon" aria-label={t('removeAttachment', { name: a.name })} onClick={() => detach.mutate(a.fileId)}><Trash2 className="size-4" aria-hidden /></Button>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('fileHint')}</p>
      </CardBody>
    </Card>
  );
}

function History({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks');
  const format = useFormatter();
  const { orgId } = useOrg();
  const text = useActivityText();
  const history = useQuery({ queryKey: orgKey(orgId, 'tasks', taskId, 'history'), queryFn: () => api.org(orgId).tasks.history(taskId) });
  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('history')}</CardTitle></CardHeader>
      <CardBody>
        {history.isError && <ErrorAlert error={history.error} />}
        {history.data?.length === 0 && <p className="text-sm text-muted">{t('noHistory')}</p>}
        <ol className="space-y-3">
          {[...(history.data ?? [])].reverse().map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-ink-2">{text(e)}</span>
              <span className="ms-2 text-xs text-muted">{format.dateTime(new Date(e.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

export function TaskDetail({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks');
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can, membershipId } = useOrg();
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState('');
  const key = orgKey(orgId, 'tasks', taskId);
  const task = useQuery({ queryKey: key, queryFn: () => api.org(orgId).tasks.get(taskId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const people = useQuery({ queryKey: orgKey(orgId, 'members', 'assignable'), queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: can('member.read') && can('task.manage') });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'tasks') });
  };
  const fail = (e: unknown) => toast(errorMessage(e), 'error');
  const setStatus = useMutation({ mutationFn: (s: AssigneeStatus) => api.org(orgId).tasks.setStatus(taskId, s), onSuccess: refresh, onError: fail });
  const setLifecycle = useMutation({
    mutationFn: (status: 'OPEN' | 'CANCELLED') => api.org(orgId).tasks.update(taskId, { version: task.data!.version, status }),
    onSuccess: refresh,
    onError: async (e) => { if (e instanceof ApiError && e.code === 'CONFLICT') { await refresh(); toast(t('conflict'), 'error'); } else fail(e); },
  });
  const addAssignee = useMutation({ mutationFn: () => api.org(orgId).tasks.addAssignees(taskId, { assigneeMembershipIds: [toAdd] }), onSuccess: async () => { setToAdd(''); await refresh(); }, onError: fail });
  const removeAssignee = useMutation({ mutationFn: (id: string) => api.org(orgId).tasks.removeAssignee(taskId, id), onSuccess: refresh, onError: fail });
  const remove = useMutation({ mutationFn: () => api.org(orgId).tasks.remove(taskId), onSuccess: async () => { await refresh(); toast(t('deleted')); router.replace(`/o/${slug}/tasks`); }, onError: fail });

  if (task.isPending) return <Skeleton className="h-64" />;
  if (task.isError) return <div className="space-y-4"><ErrorAlert error={task.error} /><Link href={`/o/${slug}/tasks`} className="text-sm font-medium text-link hover:underline">{t('back')}</Link></div>;
  const d = task.data;
  const mine = d.assignees.find((a) => a.membershipId === membershipId);
  const assigned = new Set(d.assignees.map((a) => a.membershipId));
  const options = people.data?.data.filter((m) => !assigned.has(m.id)) ?? [];
  const manage = can('task.manage');

  return (
    <>
      <Link href={`/o/${slug}/tasks`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader
        title={d.title}
        description={t('createdBy', { name: d.createdByName })}
        actions={manage && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>{t('edit')}</Button>
            {d.status === 'CANCELLED'
              ? <Button variant="secondary" size="sm" loading={setLifecycle.isPending} onClick={() => setLifecycle.mutate('OPEN')}>{t('reopen')}</Button>
              : <Button variant="secondary" size="sm" loading={setLifecycle.isPending} onClick={() => setLifecycle.mutate('CANCELLED')}>{t('cancelTask')}</Button>}
            <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => remove.mutateAsync()}>{t('delete')}</ConfirmButton>
          </>
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="anim-rise">
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><TaskStatusBadge status={d.status} /><PriorityBadge priority={d.priority} /><DueLabel task={d} /></div>
              {d.status === 'CANCELLED' && <Badge tone="warn">{t('cancelledNotice')}</Badge>}
              {d.description ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{d.description}</p> : null}
              {mine ? (
                <div role="group" aria-label={t('yourProgress')} className="space-y-2">
                  <p className="text-sm font-medium text-ink-2">{t('yourProgress')}</p>
                  <div className="flex flex-wrap gap-2">
                    {MY_STATUSES.map((s) => (
                      <Button key={s} size="sm" variant={mine.status === s ? 'primary' : 'secondary'} aria-pressed={mine.status === s} disabled={d.status === 'CANCELLED' || !can('task.update_status')} loading={setStatus.isPending && setStatus.variables === s} onClick={() => setStatus.mutate(s)}>
                        {t(`myStatus.${s}` as 'myStatus.PENDING')}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                d.assignees.length > 0 && <p className="text-xs text-muted">{t('notAssignedToYou')}</p>
              )}
            </CardBody>
          </Card>
          <Attachments task={d} />
          <Comments taskId={taskId} />
        </div>
        <div className="space-y-6">
          <Card className="anim-rise">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('assignees')} <Badge className="ms-2">{d.assignees.length}</Badge></CardTitle>
              {d.assignees.length > 0 && <span className="text-xs text-muted">{t('progressOf', { done: d.assignees.filter((a) => a.status === 'DONE').length, total: d.assignees.length })}</span>}
            </CardHeader>
            <CardBody className="space-y-3">
              {manage && people.data && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (toAdd) addAssignee.mutate(); }}>
                  <Select value={toAdd} onChange={(e) => setToAdd(e.target.value)} aria-label={t('addAssignee')} className="h-9 min-w-0 flex-1">
                    <option value="">{t('addAssignee')}</option>
                    {options.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                  </Select>
                  <Button type="submit" size="sm" loading={addAssignee.isPending} disabled={!toAdd}>{t('add')}</Button>
                </form>
              )}
              <ul className="divide-y divide-line">
                {d.assignees.map((a) => (
                  <li key={a.membershipId} className="flex items-center gap-2 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{a.fullName}</span>
                    <Badge tone={a.status === 'DONE' ? 'ok' : a.status === 'IN_PROGRESS' ? 'accent' : 'neutral'}>{t(`myStatus.${a.status}` as 'myStatus.DONE')}</Badge>
                    {manage && <Button variant="ghost" size="icon" aria-label={t('removeAssignee', { name: a.fullName })} onClick={() => removeAssignee.mutate(a.membershipId)}><UserMinus className="size-4" aria-hidden /></Button>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <History taskId={taskId} />
        </div>
      </div>
      {editing && <EditDialog task={d} onClose={() => setEditing(false)} />}
    </>
  );
}
