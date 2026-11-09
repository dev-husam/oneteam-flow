import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AssessmentAnswers, CoachAssessment, CoachResource, CoachSession } from '@pt/api-client';
import { ASSESSMENT_LIMITS, questionLabel } from '@pt/domain';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { usePrefs } from '@/stores/prefs';
import { AppText, Banner, Button, Card, TextField } from './kit';
import { radius, useColors } from './theme';

export const useWhen = () => {
  const locale = usePrefs((s) => s.locale);
  return (iso: string, withTime = true) => new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));
};

/** One coaching session. Coaches can mark it held or cancel it; clients only read it. */
export function SessionCard({ session, orgId, manage }: { session: CoachSession; orgId: string; manage: boolean }) {
  const t = useT();
  const when = useWhen();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['org', orgId, 'coaching'] });
  const held = useMutation({ mutationFn: () => api.org(orgId).coaching.sessions.complete(session.id), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const cancel = useMutation({ mutationFn: () => api.org(orgId).coaching.sessions.cancel(session.id), onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });
  const started = new Date(session.startsAt).getTime() <= mountedAt;
  return (
    <Card>
      <AppText variant="heading">{when(session.startsAt)}</AppText>
      <AppText variant="muted">{t('coaching.sessions.minutes', { count: session.durationMinutes })} · {manage ? session.clientName : t('coaching.sessions.with', { name: session.coachName })} · {t(`coaching.sessions.status.${session.status}`)}</AppText>
      {session.location ? (/^https?:\/\//i.test(session.location) ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(session.location!)}><AppText variant="label">{session.location}</AppText></Pressable> : <AppText>{session.location}</AppText>) : null}
      {session.agenda ? <AppText variant="muted">{session.agenda}</AppText> : null}
      {error ? <Banner>{error}</Banner> : null}
      {manage && session.status === 'PLANNED' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {started ? <View style={{ flex: 1 }}><Button title={t('coaching.sessions.markHeld')} variant="secondary" loading={held.isPending} onPress={() => held.mutate()} /></View> : null}
          <View style={{ flex: 1 }}><Button title={t('coaching.sessions.cancelSession')} variant="secondary" loading={cancel.isPending} onPress={() => cancel.mutate()} /></View>
        </View>
      ) : null}
    </Card>
  );
}

/** Answer an assessment: 1 to 10 buttons, yes/no buttons, text fields. Sends once everything required is filled in. */
export function AssessmentForm({ assessment, orgId, onDone }: { assessment: CoachAssessment; orgId: string; onDone: () => void }) {
  const t = useT();
  const c = useColors();
  const locale = usePrefs((s) => s.locale);
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<AssessmentAnswers>({});
  const [error, setError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => api.org(orgId).coaching.assessments.submit(assessment.id, answers),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'coaching'] }); onDone(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const complete = assessment.questions.every((q) => q.kind === 'TEXT' || answers[q.id] !== undefined);
  const choice = (selected: boolean) => ({ minWidth: 40, minHeight: 44, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 10, borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accent : c.surface });
  return (
    <Card>
      <AppText variant="heading">{assessment.title}</AppText>
      {assessment.questions.map((q) => {
        const label = questionLabel(q, locale);
        const value = answers[q.id];
        return (
          <View key={q.id} style={{ gap: 6 }}>
            {q.kind === 'TEXT' ? (
              <TextField label={label} value={typeof value === 'string' ? value : ''} onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} multiline maxLength={ASSESSMENT_LIMITS.text} />
            ) : (
              <>
                <AppText variant="label">{label}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
                  {(q.kind === 'SCALE' ? Array.from({ length: ASSESSMENT_LIMITS.scaleMax }, (_, i) => i + 1) : [true, false]).map((v) => (
                    <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ selected: value === v }} accessibilityLabel={typeof v === 'number' ? String(v) : v ? t('coaching.assessments.yes') : t('coaching.assessments.no')} onPress={() => setAnswers((a) => ({ ...a, [q.id]: v }))} style={choice(value === v)}>
                      <AppText style={{ color: value === v ? c.accentInk : c.ink, fontWeight: '600' }}>{typeof v === 'number' ? v : v ? t('coaching.assessments.yes') : t('coaching.assessments.no')}</AppText>
                    </Pressable>
                  ))}
                </View>
                {q.kind === 'SCALE' ? <AppText variant="muted">{t('coaching.assessments.scaleHint')}</AppText> : null}
              </>
            )}
          </View>
        );
      })}
      {error ? <Banner>{error}</Banner> : null}
      <Button title={t('coaching.assessments.submit')} loading={submit.isPending} disabled={!complete} onPress={() => { setError(null); submit.mutate(); }} />
    </Card>
  );
}

export function ResourceCard({ resource, orgId }: { resource: CoachResource; orgId: string }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const open = useMutation({
    mutationFn: async () => (await api.org(orgId).files.downloadUrl(resource.file!.fileId)).url,
    onSuccess: (url) => void Linking.openURL(url),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Card>
      <AppText variant="heading">{resource.title}</AppText>
      {resource.description ? <AppText variant="muted">{resource.description}</AppText> : null}
      <AppText variant="muted">{t('coaching.resources.from', { name: resource.createdByName })}</AppText>
      {error ? <Banner>{error}</Banner> : null}
      {resource.url ? <Button title={t('coaching.resources.open')} variant="secondary" onPress={() => void Linking.openURL(resource.url!)} /> : null}
      {resource.file ? <Button title={`${t('coaching.resources.download')}: ${resource.file.fileName}`} variant="secondary" loading={open.isPending} onPress={() => open.mutate()} /> : null}
    </Card>
  );
}
