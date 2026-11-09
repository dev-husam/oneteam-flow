import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useOrgContext } from '@/features/org';
import { formatShortDate, formatValue, metricName } from '@/features/work';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { Bars, ProgressBar } from '@/ui/bars';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/ui/kit';

/** A person's measurements over time and their goals. Staff pick a person; a client sees their own progress. */
export default function Progress() {
  const t = useT();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const orgId = usePrefs((s) => s.activeOrgId)!;
  const locale = usePrefs((s) => s.locale);
  const { can, context } = useOrgContext();
  const me = context?.membership.id;
  const [personPick, setPerson] = useState('');
  const [metricPick, setMetric] = useState('');
  const [value, setValue] = useState('');

  const people = useQuery({ queryKey: ['org', orgId, 'members', 'progress'], queryFn: () => api.org(orgId).members.list({ status: 'ACTIVE', limit: 100 }), enabled: can('member.read') });
  const metrics = useQuery({ queryKey: ['org', orgId, 'progress', 'metrics'], queryFn: () => api.org(orgId).progress.metrics.list() });
  const options = people.data?.data ?? [];
  const subject = personPick || (options.find((p) => p.id !== me)?.id ?? me ?? '');
  const ready = Boolean(me) && (!can('member.read') || people.isSuccess);
  const metricId = metricPick || metrics.data?.[0]?.id || '';
  const metric = metrics.data?.find((m) => m.id === metricId);

  const summary = useQuery({
    queryKey: ['org', orgId, 'progress', 'summary', subject, metricId],
    queryFn: () => api.org(orgId).progress.summary({ subjectMembershipId: subject, metricId }),
    enabled: Boolean(metricId) && ready && Boolean(subject),
  });
  const goals = useQuery({
    queryKey: ['org', orgId, 'progress', 'goals', subject],
    queryFn: () => api.org(orgId).progress.goals.list({ subjectMembershipId: subject }),
    enabled: ready && Boolean(subject),
  });
  const record = useMutation({
    mutationFn: () => api.org(orgId).progress.records.create({ subjectMembershipId: subject, metricId, value: Number(value.replace(',', '.')) }),
    onSuccess: async () => { setValue(''); await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'progress'] }); },
  });

  if (metrics.isPending || !ready) return <Screen><ActivityIndicator /></Screen>;
  if (metrics.isError) return <Screen><Banner>{errorMessage(metrics.error)}</Banner></Screen>;
  if (metrics.data.length === 0) return <Screen><AppText variant="heading">{t('progress.noMetrics')}</AppText><AppText variant="muted">{t('progress.noMetricsBody')}</AppText></Screen>;

  const points = summary.data?.points ?? [];
  const s = summary.data?.summary;
  const precision = metric?.precision ?? 2;
  const fmt = (v: number) => formatValue(v, precision, locale);
  const valueNumber = Number(value.replace(',', '.'));
  const canRecord = can('progress.record') && value.trim() !== '' && Number.isFinite(valueNumber);

  return (
    <Screen>
      {options.length > 1 ? (
        <View style={{ gap: 8 }}>
          <AppText variant="label">{t('progress.person')}</AppText>
          {options.map((p) => <Button key={p.id} title={p.fullName} variant={p.id === subject ? 'primary' : 'secondary'} onPress={() => setPerson(p.id)} accessibilityState={{ selected: p.id === subject }} />)}
        </View>
      ) : null}
      {metrics.data.length > 1 ? (
        <View style={{ gap: 8 }}>
          <AppText variant="label">{t('progress.metric')}</AppText>
          {metrics.data.map((m) => <Button key={m.id} title={`${metricName(t, m)} (${m.unit})`} variant={m.id === metricId ? 'primary' : 'secondary'} onPress={() => setMetric(m.id)} accessibilityState={{ selected: m.id === metricId }} />)}
        </View>
      ) : null}

      {summary.isError ? <Banner>{errorMessage(summary.error)}</Banner> : null}
      {summary.isPending ? <ActivityIndicator /> : null}
      {metric && s && points.length === 0 ? <Card><AppText variant="heading">{t('progress.noData')}</AppText>{can('progress.record') ? <AppText variant="muted">{t('progress.noDataBody')}</AppText> : null}</Card> : null}
      {metric && s && points.length > 0 ? (
        <Card>
          <AppText variant="heading">{metricName(t, metric)} ({metric.unit})</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {([['first', s.first?.value], ['latest', s.latest?.value], ['change', s.change], ['lowest', s.min], ['highest', s.max]] as const).map(([k, v]) => (
              <View key={k} style={{ gap: 2 }}>
                <AppText variant="muted">{t(`progress.${k}`)}</AppText>
                <AppText variant="heading">{v == null ? '—' : `${k === 'change' && v > 0 ? '+' : ''}${fmt(v)}`}</AppText>
              </View>
            ))}
          </View>
          {s.change !== null && s.change !== 0 ? <AppText variant="muted">{t(s.improved === true ? 'progress.trendGood' : s.improved === false ? 'progress.trendBad' : 'progress.trendNeutral')}</AppText> : null}
          <Bars values={points.slice(-10).map((p) => p.value)} labels={points.slice(-10).map((p) => formatShortDate(p.recordedAt, locale))} label={t('progress.chartLabel', { metric: metricName(t, metric) })} />
        </Card>
      ) : null}

      {can('progress.record') && metric ? (
        <Card>
          <AppText variant="heading">{t('progress.record')}</AppText>
          {record.isError ? <Banner>{errorMessage(record.error)}</Banner> : null}
          <TextField label={`${t('progress.value')} (${metric.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
          <Button title={t('progress.add')} loading={record.isPending} disabled={!canRecord} onPress={() => record.mutate()} />
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">{t('progress.goals')}</AppText>
        {goals.data?.length === 0 ? <AppText variant="muted">{t('progress.noGoals')}</AppText> : null}
        {goals.data?.map((g) => {
          const gm = metrics.data.find((m) => m.id === g.metricId);
          return (
            <View key={g.id} style={{ gap: 6 }}>
              <AppText variant="label">{g.title} · {t(`progress.goalStatus.${g.status}`)}</AppText>
              {gm && g.targetValue !== null ? <AppText variant="muted">{g.baselineValue !== null ? `${formatValue(g.baselineValue, gm.precision, locale)} → ` : ''}{formatValue(g.targetValue, gm.precision, locale)} {gm.unit}{g.currentValue !== null ? ` · ${formatValue(g.currentValue, gm.precision, locale)} ${gm.unit}` : ''}</AppText> : null}
              {g.progress !== null ? <><ProgressBar ratio={g.progress} tone={g.status === 'ACHIEVED' ? 'ok' : 'accent'} label={g.title} /><AppText variant="muted">{t('progress.goalProgress', { percent: Math.round(g.progress * 100) })}</AppText></> : null}
              {g.milestones.map((m) => <AppText key={m.id} variant="muted">{m.achievedAt ? '✓ ' : '○ '}{m.title}</AppText>)}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
