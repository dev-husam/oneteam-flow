'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Exercise } from '@pt/api-client';
import { EQUIPMENT, MUSCLE_GROUPS } from '@pt/domain';
import { Dumbbell, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { orgKey, useOrg } from '@/lib/org/org-context';
import { useDebounced } from '@/lib/use-debounced';
import { useExerciseName } from './labels';

type Group = (typeof MUSCLE_GROUPS)[number];
type Gear = (typeof EQUIPMENT)[number];

function ExerciseDialog({ exercise, onClose }: { exercise?: Exercise; onClose: () => void }) {
  const t = useTranslations('fitness');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [name, setName] = useState(exercise?.name.en ?? '');
  const [nameAr, setNameAr] = useState(exercise?.name.ar ?? '');
  const [muscleGroup, setGroup] = useState<Group>((exercise?.muscleGroup as Group) ?? 'CHEST');
  const [equipment, setGear] = useState<Gear>((exercise?.equipment as Gear) ?? 'BODYWEIGHT');
  const [instructions, setInstructions] = useState(exercise?.instructions?.en ?? '');
  const [instructionsAr, setInstructionsAr] = useState(exercise?.instructions?.ar ?? '');
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), nameAr: nameAr.trim() || undefined, muscleGroup, equipment, instructions: instructions.trim() || undefined, instructionsAr: instructionsAr.trim() || undefined, videoUrl: videoUrl.trim() || undefined };
      return exercise ? api.org(orgId).fitness.exercises.update(exercise.id, body) : api.org(orgId).fitness.exercises.create(body);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'exercises') }); toast(t('exercises.saved')); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} title={exercise ? t('exercises.editTitle') : t('exercises.createTitle')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {save.isError && <ErrorAlert error={save.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('exercises.nameEn')}>{(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />}</Field>
          <Field label={t('exercises.nameAr')} optionalLabel={t('optional')}>{(c) => <Input {...c} dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={120} />}</Field>
          <Field label={t('exercises.muscleGroup')}>
            {(c) => <Select {...c} value={muscleGroup} onChange={(e) => setGroup(e.target.value as Group)}>{MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{t(`muscle.${g}`)}</option>)}</Select>}
          </Field>
          <Field label={t('exercises.equipment')}>
            {(c) => <Select {...c} value={equipment} onChange={(e) => setGear(e.target.value as Gear)}>{EQUIPMENT.map((g) => <option key={g} value={g}>{t(`equipment.${g}`)}</option>)}</Select>}
          </Field>
        </div>
        <Field label={t('exercises.instructionsEn')} optionalLabel={t('optional')}>{(c) => <Textarea {...c} rows={3} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}</Field>
        <Field label={t('exercises.instructionsAr')} optionalLabel={t('optional')}>{(c) => <Textarea {...c} dir="rtl" rows={3} maxLength={2000} value={instructionsAr} onChange={(e) => setInstructionsAr(e.target.value)} />}</Field>
        <Field label={t('exercises.video')} hint={t('exercises.videoHint')} optionalLabel={t('optional')}>{(c) => <Input {...c} dir="ltr" type="url" placeholder="https://" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={500} />}</Field>
        <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2} className="w-full">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

export function ExercisesPage() {
  const t = useTranslations('fitness');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const exerciseName = useExerciseName();
  const { orgId, can } = useOrg();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group | ''>('');
  const [gear, setGear] = useState<Gear | ''>('');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const search = useDebounced(q.trim());
  const list = useQuery({
    queryKey: orgKey(orgId, 'fitness', 'exercises', search, group, gear),
    queryFn: () => api.org(orgId).fitness.exercises.list({ q: search || undefined, muscleGroup: group || undefined, equipment: gear || undefined }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.org(orgId).fitness.exercises.archive(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orgKey(orgId, 'fitness', 'exercises') }); toast(t('exercises.archived')); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const manage = can('fitness.exercise.manage');

  return (
    <>
      <PageHeader title={t('exercises.title')} description={t('exercises.subtitle')} actions={manage && <Button onClick={() => setEditing('new')}>{t('exercises.create')}</Button>} />
      <Card className="anim-rise">
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('exercises.searchPlaceholder')} aria-label={t('exercises.search')} className="w-full sm:max-w-xs" />
          <Select value={group} onChange={(e) => setGroup(e.target.value as Group | '')} aria-label={t('exercises.muscleGroup')} className="w-full sm:w-48">
            <option value="">{t('exercises.allGroups')}</option>
            {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{t(`muscle.${g}`)}</option>)}
          </Select>
          <Select value={gear} onChange={(e) => setGear(e.target.value as Gear | '')} aria-label={t('exercises.equipment')} className="w-full sm:w-48">
            <option value="">{t('exercises.allEquipment')}</option>
            {EQUIPMENT.map((g) => <option key={g} value={g}>{t(`equipment.${g}`)}</option>)}
          </Select>
        </div>
        {list.isPending && <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
        {list.isError && <div className="p-4"><ErrorAlert error={list.error} /></div>}
        {list.data?.length === 0 && <EmptyState icon={Dumbbell} title={t('exercises.empty')}>{t('exercises.emptyBody')}</EmptyState>}
        <ul className="divide-y divide-line">
          {list.data?.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{exerciseName(e)}</p>
                {e.instructions && <p className="line-clamp-2 text-sm text-muted">{e.instructions.en ?? e.instructions.ar}</p>}
              </div>
              <Badge>{t(`muscle.${e.muscleGroup}`)}</Badge>
              <Badge>{t(`equipment.${e.equipment}`)}</Badge>
              {e.system ? <Badge tone="accent">{t('exercises.builtIn')}</Badge> : <Badge tone="ok">{t('exercises.custom')}</Badge>}
              {e.videoUrl && <a href={e.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-link hover:underline"><ExternalLink className="size-3.5" aria-hidden />{t('exercises.watch')}</a>}
              {manage && !e.system && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>{t('edit')}</Button>
                  <ConfirmButton size="sm" confirmLabel={t('confirmAgain')} onConfirm={() => archive.mutate(e.id)}>{t('exercises.archive')}</ConfirmButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {editing && <ExerciseDialog exercise={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
