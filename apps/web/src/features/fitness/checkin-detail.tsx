'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Checkin } from '@pt/api-client';
import { ArrowLeft, EyeOff } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { SecureImage } from './secure-image';

const STATUS_TONE = { DRAFT: 'neutral', SUBMITTED: 'warn', REVIEWED: 'ok' } as const;

function Comments({ checkin, canComment }: { checkin: Checkin; canComment: boolean }) {
  const t = useTranslations('checkin');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [body, setBody] = useState('');
  const post = useMutation({
    mutationFn: () => api.org(orgId).fitness.checkins.comment(checkin.id, body.trim()),
    onSuccess: async () => { setBody(''); await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('comments')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {checkin.comments.length === 0 && <p className="text-sm text-muted">{t('noComments')}</p>}
        <ul className="space-y-3">
          {checkin.comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">{c.authorName}</span> <span className="text-xs text-muted">{format.dateTime(new Date(c.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <p className="whitespace-pre-wrap text-ink-2">{c.body}</p>
            </li>
          ))}
        </ul>
        {canComment && (
          <form className="space-y-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }}>
            <Textarea aria-label={t('commentLabel')} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('commentPlaceholder')} rows={2} maxLength={2000} />
            <Button type="submit" size="sm" loading={post.isPending} disabled={!body.trim()}>{t('post')}</Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/** A submitted check-in: numbers, how the week went, photos (when the viewer may see them), feedback and the discussion. */
export function CheckinThread({ checkin, canComment }: { checkin: Checkin; canComment: boolean }) {
  const t = useTranslations('checkin');
  const f = useTranslations('fitness');
  const metric = (key: string) => (f.has(`metric.${key}` as 'metric.weight_kg') ? f(`metric.${key}` as 'metric.weight_kg') : key);
  const format = useFormatter();
  return (
    <div className="space-y-6">
      <Card className="anim-rise">
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {checkin.measurements.map((m) => <div key={m.key}><dt className="text-xs text-muted">{metric(m.key)}</dt><dd className="text-lg font-semibold tabular-nums">{m.value} <span className="text-xs font-normal text-muted">{m.unit}</span></dd></div>)}
            <div><dt className="text-xs text-muted">{t('workoutAdherence')}</dt><dd className="text-lg font-semibold tabular-nums">{checkin.adherence.workoutPct === null ? '—' : `${checkin.adherence.workoutPct}%`}</dd></div>
            <div><dt className="text-xs text-muted">{t('nutritionAdherence')}</dt><dd className="text-lg font-semibold tabular-nums">{checkin.adherence.nutritionPct === null ? '—' : `${checkin.adherence.nutritionPct}%`}</dd></div>
          </dl>
          {checkin.clientNotes && <div><p className="text-xs text-muted">{t('notes')}</p><p className="whitespace-pre-wrap text-sm">{checkin.clientNotes}</p></div>}
          {checkin.submittedAt && <p className="text-xs text-muted">{t('submittedOn', { date: format.dateTime(new Date(checkin.submittedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
        </CardBody>
      </Card>

      <Card className="anim-rise">
        <CardHeader><CardTitle>{t('photos')}</CardTitle></CardHeader>
        <CardBody>
          {checkin.photosHidden && <p className="flex items-center gap-2 text-sm text-muted"><EyeOff className="size-4" aria-hidden />{t('photosHiddenNote')}</p>}
          {!checkin.photosHidden && checkin.photos.length === 0 && <p className="text-sm text-muted">{t('noPhotos')}</p>}
          <div className="grid grid-cols-3 gap-3">
            {checkin.photos.map((p) => <figure key={p.id} className="space-y-1"><SecureImage fileId={p.fileId} alt={t(`angle.${p.angle}`)} /><figcaption className="text-xs text-muted">{t(`angle.${p.angle}`)}</figcaption></figure>)}
          </div>
        </CardBody>
      </Card>

      {checkin.feedback && (
        <Card className="anim-rise"><CardHeader><CardTitle>{t('feedback')}</CardTitle>{checkin.reviewedByName && <p className="text-sm text-muted">{t('reviewedBy', { name: checkin.reviewedByName })}</p>}</CardHeader><CardBody><p className="whitespace-pre-wrap text-sm">{checkin.feedback}</p></CardBody></Card>
      )}
      <Comments checkin={checkin} canComment={canComment} />
    </div>
  );
}

function Compare({ checkinId, clientId }: { checkinId: string; clientId: string }) {
  const t = useTranslations('checkin');
  const f = useTranslations('fitness');
  const metric = (key: string) => (f.has(`metric.${key}` as 'metric.weight_kg') ? f(`metric.${key}` as 'metric.weight_kg') : key);
  const format = useFormatter();
  const { orgId } = useOrg();
  const [otherId, setOtherId] = useState('');
  const others = useQuery({ queryKey: orgKey(orgId, 'fitness', 'checkins', 'of', clientId), queryFn: () => api.org(orgId).fitness.checkins.list({ clientMembershipId: clientId, limit: 50 }) });
  const options = others.data?.data.filter((c) => c.id !== checkinId && c.status !== 'DRAFT') ?? [];
  // the older one is "before", the newer one "after"
  const pair = options.find((o) => o.id === otherId);
  const current = others.data?.data.find((c) => c.id === checkinId);
  const [fromId, toId] = pair && current ? (pair.weekStart < current.weekStart ? [pair.id, checkinId] : [checkinId, pair.id]) : ['', ''];
  const cmp = useQuery({ queryKey: orgKey(orgId, 'fitness', 'checkins', 'compare', fromId, toId), queryFn: () => api.org(orgId).fitness.checkins.compare(fromId, toId), enabled: Boolean(fromId && toId) });

  return (
    <Card className="anim-rise">
      <CardHeader><CardTitle>{t('compare')}</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        <Select aria-label={t('compareWith')} value={otherId} onChange={(e) => setOtherId(e.target.value)} className="h-9 max-w-sm">
          <option value="">{t('compareWith')}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{format.dateTime(new Date(`${o.weekStart}T00:00:00`), { dateStyle: 'medium' })}{o.weightKg !== null ? ` · ${o.weightKg} kg` : ''}</option>)}
        </Select>
        {cmp.isError && <ErrorAlert error={cmp.error} />}
        {cmp.data && (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-start text-xs text-muted"><th scope="col" className="py-1 text-start font-medium">{t('measurement')}</th><th scope="col" className="py-1 text-start font-medium">{t('before')}</th><th scope="col" className="py-1 text-start font-medium">{t('after')}</th><th scope="col" className="py-1 text-start font-medium">{t('change')}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {cmp.data.changes.map((c) => (
                  <tr key={c.key}>
                    <th scope="row" className="py-2 text-start font-medium">{metric(c.key)}</th>
                    <td className="py-2 tabular-nums">{c.from ?? '—'}</td>
                    <td className="py-2 tabular-nums">{c.to ?? '—'}</td>
                    <td className="py-2 tabular-nums">{c.change === null ? '—' : `${c.change > 0 ? '+' : ''}${c.change} ${c.unit ?? ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cmp.data.from.photosHidden && (
              <div className="grid gap-4 sm:grid-cols-3">
                {(['FRONT', 'SIDE', 'BACK'] as const).map((angle) => {
                  const a = cmp.data.from.photos.find((p) => p.angle === angle);
                  const b = cmp.data.to.photos.find((p) => p.angle === angle);
                  if (!a && !b) return null;
                  return (
                    <div key={angle} className="space-y-1">
                      <p className="text-xs font-medium text-ink-2">{t(`angle.${angle}`)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>{a ? <SecureImage fileId={a.fileId} alt={`${t(`angle.${angle}`)} ${t('before')}`} /> : null}<p className="mt-1 text-center text-xs text-muted">{t('before')}</p></div>
                        <div>{b ? <SecureImage fileId={b.fileId} alt={`${t(`angle.${angle}`)} ${t('after')}`} /> : null}<p className="mt-1 text-center text-xs text-muted">{t('after')}</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** One client's check-in for the trainer: review it, discuss it, compare it with another week. */
export function CheckinDetail({ checkinId }: { checkinId: string }) {
  const t = useTranslations('checkin');
  const format = useFormatter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { orgId, slug, can } = useOrg();
  const [feedback, setFeedback] = useState('');
  const checkin = useQuery({ queryKey: orgKey(orgId, 'fitness', 'checkins', checkinId), queryFn: () => api.org(orgId).fitness.checkins.get(checkinId), retry: (c, e) => c < 2 && !(e instanceof ApiError && e.status < 500) });
  const review = useMutation({
    mutationFn: () => api.org(orgId).fitness.checkins.review(checkinId, feedback.trim() || undefined),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness') }); toast(t('reviewedToast')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (checkin.isPending) return <Skeleton className="h-64" />;
  const back = can('fitness.checkin.review') ? `/o/${slug}/checkins` : `/o/${slug}/checkin`;
  if (checkin.isError) return <div className="space-y-4"><ErrorAlert error={checkin.error} /><Link href={back} className="text-sm font-medium text-link hover:underline">{t('back')}</Link></div>;
  const c = checkin.data;
  return (
    <>
      <Link href={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t('back')}</Link>
      <PageHeader
        title={c.clientName}
        description={t('weekOf', { date: format.dateTime(new Date(`${c.week.start}T00:00:00`), { dateStyle: 'medium' }) })}
        actions={<><Badge tone={STATUS_TONE[c.status]}>{t(`status.${c.status}`)}</Badge>{can('fitness.client.read') && <Link href={`/o/${slug}/clients/${c.clientMembershipId}`} className="text-sm font-medium text-link hover:underline">{t('openClient')}</Link>}</>}
      />
      <div className="space-y-6">
        <CheckinThread checkin={c} canComment />
        {can('fitness.checkin.review') && c.status === 'SUBMITTED' && (
          <Card className="anim-rise">
            <CardHeader><CardTitle>{t('review')}</CardTitle></CardHeader>
            <CardBody>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); review.mutate(); }}>
                <Textarea aria-label={t('feedback')} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('feedbackPlaceholder')} rows={3} maxLength={2000} />
                <Button type="submit" loading={review.isPending}>{t('markReviewed')}</Button>
              </form>
            </CardBody>
          </Card>
        )}
        {c.status !== 'DRAFT' && <Compare checkinId={c.id} clientId={c.clientMembershipId} />}
      </div>
    </>
  );
}
