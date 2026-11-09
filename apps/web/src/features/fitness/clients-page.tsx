'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type ClientDetail as ClientData } from '@pt/api-client';
import { ACTIVITY_LEVELS, GOAL_TYPES, SEXES } from '@pt/domain';
import { ArrowLeft, Eye, UsersRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';
import { useDebounced } from '@/lib/use-debounced';
import { AssignDialog } from './assign-dialog';
import { NutritionAssignDialog } from './nutrition-assign-dialog';
import { SecureImage } from './secure-image';

type Goal = (typeof GOAL_TYPES)[number];
type Level = (typeof ACTIVITY_LEVELS)[number];
type Sex = (typeof SEXES)[number];

export function ClientsPage() {
  const t = useTranslations('fitness');
  const ci = useTranslations('checkin');
  const format = useFormatter();
  const { orgId, slug, can } = useOrg();
  const [q, setQ] = useState('');
  const [assigning, setAssigning] = useState(false);
  const search = useDebounced(q.trim());
  const list = useCursorList(orgKey(orgId, 'fitness', 'clients', 'list', search), (cursor) => api.org(orgId).fitness.clients.list({ q: search || undefined, cursor, limit: 25 }));

  return (
    <>
      <PageHeader title={t('clients.title')} description={t('clients.subtitle')} actions={can('fitness.workout_plan.assign') && <Button onClick={() => setAssigning(true)}>{t('assign.title')}</Button>} />
      <Card className="anim-rise">
        <div className="border-b border-line p-4"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('clients.searchPlaceholder')} aria-label={t('clients.search')} className="w-full sm:max-w-xs" /></div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {!list.isPending && !list.isError && list.items.length === 0 && <EmptyState icon={UsersRound} title={q ? t('clients.noResults') : t('clients.empty')}>{q ? undefined : t('clients.emptyBody')}</EmptyState>}
        {list.items.length > 0 && (
          <Table>
            <THead><TR><TH>{t('clients.name')}</TH><TH>{t('clients.goal')}</TH><TH>{t('clients.plans')}</TH><TH>{t('clients.lastWorkout')}</TH><TH>{ci('title')}</TH></TR></THead>
            <TBody>
              {list.items.map((c) => (
                <TR key={c.membershipId}>
                  <TD><Link href={`/o/${slug}/clients/${c.membershipId}`} className="font-medium hover:text-link">{c.fullName}</Link><span className="block text-xs text-muted">{c.email}</span></TD>
                  <TD>{c.goalType ? t(`goal.${c.goalType}`) : <span className="text-muted">—</span>}</TD>
                  <TD>{c.activePlans.length === 0 ? <span className="text-muted">{t('clients.noPlan')}</span> : <span className="flex flex-wrap gap-1">{c.activePlans.map((p) => <Badge key={p.assignmentId} tone="accent">{p.planName}</Badge>)}</span>}</TD>
                  <TD className="text-muted">{c.lastSessionAt ? format.dateTime(new Date(c.lastSessionAt), { dateStyle: 'medium' }) : t('clients.never')}</TD>
                  <TD>{c.checkin === 'NONE' ? <span className="text-muted">—</span> : <Badge tone={c.checkin === 'OVERDUE' ? 'danger' : c.checkin === 'DUE' ? 'warn' : c.checkin === 'SUBMITTED' ? 'accent' : 'ok'}>{ci(`state.${c.checkin}`)}</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <LoadMore hasNextPage={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} />
      </Card>
      {assigning && <AssignDialog onClose={() => setAssigning(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- detail

function ProfileDialog({ client, onClose }: { client: ClientData; onClose: () => void }) {
  const t = useTranslations('fitness');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const p = client.profile;
  const [dob, setDob] = useState(p?.dateOfBirth ?? '');
  const [sex, setSex] = useState<Sex | ''>(p?.sex ?? '');
  const [height, setHeight] = useState(p?.heightCm == null ? '' : String(p.heightCm));
  const [goal, setGoal] = useState<Goal | ''>(p?.goalType ?? '');
  const [level, setLevel] = useState<Level | ''>(p?.activityLevel ?? '');
  const [goalsText, setGoalsText] = useState(p?.goalsText ?? '');
  const [health, setHealth] = useState(p?.injuriesNotes ?? '');
  const [weight, setWeight] = useState('');
  const save = useMutation({
    mutationFn: () => api.org(orgId).fitness.clients.updateProfile(client.membershipId, {
      dateOfBirth: dob || null, sex: sex || null, heightCm: height === '' ? null : Number(height), goalType: goal || null, activityLevel: level || null,
      goalsText: goalsText.trim() || null, injuriesNotes: health.trim() || null, startingWeightKg: weight === '' || client.startingWeightKg !== null ? undefined : Number(weight),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'clients') }); await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'progress') }); toast(t('profile.saved')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={t('profile.editTitle')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.dob')} hint={t('profile.dobHint')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />}</Field>
          <Field label={t('profile.sex')} optionalLabel={t('optional')}>
            {(c) => <Select {...c} value={sex} onChange={(e) => setSex(e.target.value as Sex | '')}><option value="">—</option>{SEXES.map((s) => <option key={s} value={s}>{t(`sex.${s}`)}</option>)}</Select>}
          </Field>
          <Field label={t('profile.height')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="number" step="0.1" min={50} max={260} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />}</Field>
          {client.startingWeightKg === null && <Field label={t('profile.startingWeight')} hint={t('profile.startingWeightHint')} optionalLabel={t('optional')}>{(c) => <Input {...c} type="number" step="0.1" min={20} max={500} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />}</Field>}
          <Field label={t('profile.goalType')} optionalLabel={t('optional')}>
            {(c) => <Select {...c} value={goal} onChange={(e) => setGoal(e.target.value as Goal | '')}><option value="">—</option>{GOAL_TYPES.map((g) => <option key={g} value={g}>{t(`goal.${g}`)}</option>)}</Select>}
          </Field>
          <Field label={t('profile.activity')} optionalLabel={t('optional')}>
            {(c) => <Select {...c} value={level} onChange={(e) => setLevel(e.target.value as Level | '')}><option value="">—</option>{ACTIVITY_LEVELS.map((g) => <option key={g} value={g}>{t(`activity.${g}`)}</option>)}</Select>}
          </Field>
        </div>
        <Field label={t('profile.goalsText')} optionalLabel={t('optional')}>{(c) => <Textarea {...c} rows={2} maxLength={2000} value={goalsText} onChange={(e) => setGoalsText(e.target.value)} />}</Field>
        <Field label={t('profile.health')} hint={t('profile.healthHint')} optionalLabel={t('optional')}>{(c) => <Textarea {...c} rows={3} maxLength={2000} value={health} onChange={(e) => setHealth(e.target.value)} />}</Field>
        <Button type="submit" loading={save.isPending} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

export function ClientDetail({ membershipId }: { membershipId: string }) {
  const t = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can, membershipId: me } = useOrg();
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigningFood, setAssigningFood] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const ci = useTranslations('checkin');
  const nu = useTranslations('nutrition');
  const client = useQuery({ queryKey: orgKey(orgId, 'fitness', 'clients', membershipId), queryFn: () => api.org(orgId).fitness.clients.get(membershipId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const sessions = useQuery({ queryKey: orgKey(orgId, 'fitness', 'sessions', membershipId), queryFn: () => api.org(orgId).fitness.sessions.list({ clientMembershipId: membershipId, limit: 10 }), enabled: can('fitness.workout.read') });
  const cancel = useMutation({
    mutationFn: (assignmentId: string) => api.org(orgId).fitness.assignments.cancel(assignmentId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') }); toast(t('clients.assignmentCancelled')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const today = new Date();
  const to = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const weekAgo = new Date(today.getTime() - 6 * 86_400_000);
  const from = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
  const nutrition = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition', 'client', membershipId, from), queryFn: () => api.org(orgId).fitness.nutrition.logs({ clientMembershipId: membershipId, from, to }), enabled: can('fitness.nutrition.read') });
  const nutritionPlans = useQuery({ queryKey: orgKey(orgId, 'fitness', 'nutrition', 'assignments', membershipId), queryFn: () => api.org(orgId).fitness.nutrition.assignments.list({ clientMembershipId: membershipId, status: 'ACTIVE', limit: 10 }), enabled: can('fitness.nutrition.read') });
  const checkins = useQuery({ queryKey: orgKey(orgId, 'fitness', 'checkins', 'of', membershipId), queryFn: () => api.org(orgId).fitness.checkins.list({ clientMembershipId: membershipId, limit: 8 }), enabled: can('fitness.checkin.read') });
  const photos = useQuery({ queryKey: orgKey(orgId, 'fitness', 'photos', membershipId), queryFn: () => api.org(orgId).fitness.photos.forClient(membershipId), enabled: can('fitness.photo.read') && showPhotos });
  const cancelNutrition = useMutation({
    mutationFn: (assignmentId: string) => api.org(orgId).fitness.nutrition.assignments.cancel(assignmentId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') }); toast(t('clients.assignmentCancelled')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (client.isPending) return <Skeleton className="h-64" />;
  const back = can('fitness.workout_plan.assign') ? `/o/${slug}/clients` : `/o/${slug}/workouts`;
  if (client.isError) return <div className="space-y-4"><ErrorAlert error={client.error} /><Link href={back} className="text-sm font-medium text-link hover:underline">{t('clients.back')}</Link></div>;
  const c = client.data;
  const p = c.profile;
  const rows: [string, string | null][] = [
    [t('profile.goalType'), p?.goalType ? t(`goal.${p.goalType}`) : null],
    [t('profile.activity'), p?.activityLevel ? t(`activity.${p.activityLevel}`) : null],
    [t('profile.height'), p?.heightCm != null ? `${p.heightCm} cm` : null],
    [t('profile.dob'), p?.dateOfBirth ? format.dateTime(new Date(`${p.dateOfBirth}T00:00:00`), { dateStyle: 'medium' }) : null],
    [t('profile.sex'), p?.sex ? t(`sex.${p.sex}`) : null],
    [t('profile.startingWeight'), c.startingWeightKg !== null ? `${c.startingWeightKg} kg` : null],
  ];

  return (
    <>
      <Link href={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('clients.back')}</Link>
      <PageHeader
        title={c.fullName}
        description={c.email}
        actions={
          <>
            {can('progress.read') && <Link href={`/o/${slug}/progress?person=${membershipId}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('clients.viewProgress')}</Link>}
            {can('fitness.client.update') && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('profile.edit')}</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('profile.title')}</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              {!p && <p className="text-sm text-muted">{t('profile.empty')}</p>}
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {rows.map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="text-sm font-medium">{value ?? '—'}</dd></div>
                ))}
              </dl>
              {p?.goalsText && <div><p className="text-xs text-muted">{t('profile.goalsText')}</p><p className="whitespace-pre-wrap text-sm">{p.goalsText}</p></div>}
              {p?.injuriesNotes && <div><p className="text-xs text-muted">{t('profile.health')}</p><p className="whitespace-pre-wrap text-sm">{p.injuriesNotes}</p></div>}
            </CardBody>
          </Card>

          {can('fitness.checkin.read') && (
            <Card className="anim-rise">
              <CardHeader><CardTitle>{ci('historyTitle')}</CardTitle></CardHeader>
              {checkins.data?.data.length === 0 && <p className="px-5 py-4 text-sm text-muted">{ci('noCheckins')}</p>}
              <ul className="divide-y divide-line">
                {checkins.data?.data.map((k) => (
                  <li key={k.id}>
                    <Link href={`/o/${slug}/checkins/${k.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                      <span className="min-w-0 flex-1 font-medium">{ci('weekOf', { date: format.dateTime(new Date(`${k.weekStart}T00:00:00`), { dateStyle: 'medium' }) })}</span>
                      {k.weightKg !== null && <span className="tabular-nums text-muted">{k.weightKg} kg</span>}
                      <Badge tone={k.status === 'REVIEWED' ? 'ok' : k.status === 'SUBMITTED' ? 'warn' : 'neutral'}>{ci(`status.${k.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {can('fitness.photo.read') && (
            <Card className="anim-rise">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2"><CardTitle>{ci('photos')}</CardTitle>{!showPhotos && <Button size="sm" variant="secondary" onClick={() => setShowPhotos(true)}><Eye className="size-4" aria-hidden />{ci('showPhotos')}</Button>}</CardHeader>
              <CardBody>
                {!showPhotos && <p className="text-sm text-muted">{ci('photosOnRequest')}</p>}
                {showPhotos && photos.data?.length === 0 && <p className="text-sm text-muted">{ci('noPhotos')}</p>}
                {photos.isError && <ErrorAlert error={photos.error} />}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {photos.data?.slice(0, 12).map((p) => <figure key={p.id} className="space-y-1"><SecureImage fileId={p.fileId} alt={ci(`angle.${p.angle}`)} /><figcaption className="text-xs text-muted">{ci(`angle.${p.angle}`)} · {format.dateTime(new Date(`${p.takenOn}T00:00:00`), { dateStyle: 'short' })}</figcaption></figure>)}
                </div>
              </CardBody>
            </Card>
          )}

          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('clients.recentWorkouts')}</CardTitle></CardHeader>
            {sessions.isError && <div className="p-4"><ErrorAlert error={sessions.error} /></div>}
            {sessions.data?.data.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t('workouts.noHistory')}</p>}
            <ul className="divide-y divide-line">
              {sessions.data?.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/o/${slug}/workouts/session/${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{s.dayName}</span><span className="block text-xs text-muted">{s.planName} · {format.dateTime(new Date(`${s.scheduledDate}T00:00:00`), { dateStyle: 'medium' })}</span></span>
                    <span className="tabular-nums text-muted">{t('workouts.setsLogged', { count: s.setCount })}</span>
                    {s.completedAt ? <Badge tone="ok">{t('workouts.completed')}</Badge> : <Badge tone="warn">{t('workouts.inProgress')}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="anim-rise">
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                <div><dt className="text-xs text-muted">{t('clients.last30')}</dt><dd className="text-2xl font-semibold tabular-nums">{c.stats.completedLast30Days}</dd></div>
                <div><dt className="text-xs text-muted">{t('clients.lastWorkout')}</dt><dd className="text-sm font-medium">{c.stats.lastSessionAt ? format.dateTime(new Date(c.stats.lastSessionAt), { dateStyle: 'medium' }) : t('clients.never')}</dd></div>
              </dl>
            </CardBody>
          </Card>
          <Card className="anim-rise">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('clients.activePlans')}</CardTitle>
              {can('fitness.workout_plan.assign') && <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>{t('assign.title')}</Button>}
            </CardHeader>
            <CardBody className="space-y-3">
              {c.activePlans.length === 0 && <p className="text-sm text-muted">{t('clients.noPlan')}</p>}
              {c.activePlans.map((a) => (
                <div key={a.assignmentId} className="space-y-1 rounded-md border border-line p-3">
                  <p className="text-sm font-medium">{can('fitness.workout_plan.manage') ? <Link href={`/o/${slug}/plans/${a.planId}`} className="hover:text-link">{a.planName}</Link> : a.planName} <span className="text-muted">v{a.versionNo}</span></p>
                  <p className="text-xs text-muted">{format.dateTime(new Date(`${a.startDate}T00:00:00`), { dateStyle: 'medium' })} → {a.endDate ? format.dateTime(new Date(`${a.endDate}T00:00:00`), { dateStyle: 'medium' }) : t('clients.openEnded')}</p>
                  {can('fitness.workout_plan.assign') && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => cancel.mutate(a.assignmentId)}>{t('clients.cancelAssignment')}</ConfirmButton>}
                </div>
              ))}
            </CardBody>
          </Card>
          {can('fitness.nutrition.read') && (
            <Card className="anim-rise">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle>{nu('clientTitle')}</CardTitle>
                {can('fitness.nutrition_plan.assign') && <Button size="sm" variant="secondary" onClick={() => setAssigningFood(true)}>{nu('assignTitle')}</Button>}
              </CardHeader>
              <CardBody className="space-y-3">
                <div><p className="text-xs text-muted">{nu('last7')}</p><p className="text-2xl font-semibold tabular-nums">{nutrition.data?.adherence.pct == null ? '—' : `${nutrition.data.adherence.pct}%`}</p>{nutrition.data && <p className="text-xs text-muted">{ci('mealsOf', { logged: nutrition.data.adherence.logged, total: nutrition.data.adherence.planned })}</p>}</div>
                {nutritionPlans.data?.data.length === 0 && <p className="text-sm text-muted">{nu('noPlan')}</p>}
                {nutritionPlans.data?.data.map((a) => (
                  <div key={a.id} className="space-y-1 rounded-md border border-line p-3">
                    <p className="text-sm font-medium">{can('fitness.nutrition_plan.manage') ? <Link href={`/o/${slug}/nutrition-plans/${a.planId}`} className="hover:text-link">{a.planName}</Link> : a.planName} <span className="text-muted">v{a.versionNo}</span></p>
                    {can('fitness.nutrition_plan.assign') && <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => cancelNutrition.mutate(a.id)}>{t('clients.cancelAssignment')}</ConfirmButton>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          {membershipId === me && <p className="text-xs text-muted">{t('profile.ownHint')}</p>}
        </div>
      </div>
      {editing && <ProfileDialog client={c} onClose={() => setEditing(false)} />}
      {assigning && <AssignDialog clientId={membershipId} onClose={() => setAssigning(false)} />}
      {assigningFood && <NutritionAssignDialog clientId={membershipId} onClose={() => setAssigningFood(false)} />}
    </>
  );
}
