'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarCheck, Dumbbell } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/shell/error-alert';
import { LoadMore } from '@/components/shell/load-more';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useCursorList } from '@/lib/use-cursor-list';

const asDate = (ymd: string) => new Date(`${ymd}T00:00:00`);

/** The client's own workouts: today, the coming days, every plan day they may also do, and their history. */
export function WorkoutsPage() {
  const t = useTranslations('fitness');
  const format = useFormatter();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { orgId, slug, membershipId } = useOrg();
  const today = useQuery({ queryKey: orgKey(orgId, 'fitness', 'today'), queryFn: () => api.org(orgId).fitness.workouts.today() });
  const history = useCursorList(orgKey(orgId, 'fitness', 'sessions', 'mine'), (cursor) => api.org(orgId).fitness.sessions.list({ cursor, limit: 10 }));
  const start = useMutation({
    mutationFn: (v: { assignmentId: string; dayId: string }) => api.org(orgId).fitness.sessions.start(v),
    onSuccess: (s) => router.push(`/o/${slug}/workouts/session/${s.id}`),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <>
      <PageHeader
        title={t('workouts.title')}
        description={today.data ? format.dateTime(asDate(today.data.date), { dateStyle: 'full' }) : t('workouts.subtitle')}
        actions={<Link href={`/o/${slug}/clients/${membershipId}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('workouts.myProfile')}</Link>}
      />
      {today.isPending && <Skeleton className="h-40" />}
      {today.isError && <ErrorAlert error={today.error} />}
      {today.data && (
        <div className="space-y-6">
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('workouts.today')}</CardTitle></CardHeader>
            {today.data.today.length === 0 && <EmptyState icon={CalendarCheck} title={t('workouts.nothingToday')}>{today.data.assignments.length === 0 ? t('workouts.noPlanBody') : t('workouts.restDayBody')}</EmptyState>}
            <ul className="divide-y divide-line">
              {today.data.today.map((item) => (
                <li key={`${item.assignmentId}-${item.dayId}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{item.dayName}</span>
                    <span className="block text-sm text-muted">{item.planName} · {t('workouts.exerciseCount', { count: item.exerciseCount })}</span>
                  </span>
                  {item.session?.completedAt ? (
                    <>
                      <Badge tone="ok">{t('workouts.completed')}</Badge>
                      <Link href={`/o/${slug}/workouts/session/${item.session.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{t('workouts.view')}</Link>
                    </>
                  ) : (
                    <Button loading={start.isPending && start.variables?.dayId === item.dayId} onClick={() => start.mutate({ assignmentId: item.assignmentId, dayId: item.dayId })}>{item.session ? t('workouts.continue') : t('workouts.start')}</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {today.data.assignments.length > 0 && (
            <Card className="anim-rise">
              <CardHeader><CardTitle>{t('workouts.anyDay')}</CardTitle></CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-muted">{t('workouts.anyDayHint')}</p>
                {today.data.assignments.map((a) => (
                  <div key={a.assignmentId} className="space-y-2">
                    <p className="text-sm font-medium">{a.planName}</p>
                    <div className="flex flex-wrap gap-2">
                      {a.days.map((d) => (
                        <Button key={d.dayId} size="sm" variant="secondary" loading={start.isPending && start.variables?.dayId === d.dayId} onClick={() => start.mutate({ assignmentId: a.assignmentId, dayId: d.dayId })}>{d.name}</Button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {today.data.upcoming.length > 0 && (
            <Card className="anim-rise">
              <CardHeader><CardTitle>{t('workouts.upcoming')}</CardTitle></CardHeader>
              <ul className="divide-y divide-line">
                {today.data.upcoming.map((d) => (
                  <li key={d.date} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="w-40 font-medium">{format.dateTime(asDate(d.date), { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                    <span className="flex flex-wrap gap-2">{d.items.map((i) => <Badge key={`${i.assignmentId}-${i.dayId}`} tone="accent">{i.dayName}</Badge>)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Card className="anim-rise mt-6">
        <CardHeader><CardTitle>{t('workouts.history')}</CardTitle></CardHeader>
        {history.isError && <div className="p-4"><ErrorAlert error={history.error} /></div>}
        {!history.isPending && history.items.length === 0 && <EmptyState icon={Dumbbell} title={t('workouts.noHistory')} />}
        <ul className="divide-y divide-line">
          {history.items.map((s) => (
            <li key={s.id}>
              <Link href={`/o/${slug}/workouts/session/${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1"><span className="block font-medium">{s.dayName}</span><span className="block text-xs text-muted">{s.planName} · {format.dateTime(asDate(s.scheduledDate), { dateStyle: 'medium' })}</span></span>
                <span className="tabular-nums text-muted">{t('workouts.setsLogged', { count: s.setCount })}</span>
                {s.volume > 0 && <span className="tabular-nums text-muted">{t('workouts.volume', { kg: format.number(s.volume, { maximumFractionDigits: 0 }) })}</span>}
                {s.completedAt ? <Badge tone="ok">{t('workouts.completed')}</Badge> : <Badge tone="warn">{t('workouts.inProgress')}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
        <LoadMore hasNextPage={history.hasNextPage} loading={history.isFetchingNextPage} onLoad={() => void history.fetchNextPage()} />
      </Card>
    </>
  );
}
