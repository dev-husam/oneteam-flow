'use client';

import { useMutation } from '@tanstack/react-query';
import { ApiError, type Message, type ReportReasonKey } from '@pt/api-client';
import { REPORT_NOTE_MAX, REPORT_REASONS } from '@pt/domain';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useOrg } from '@/lib/org/org-context';

/** Report one message you received. The dialog says exactly what is shared: this message, nothing else of the conversation. */
export function ReportDialog({ conversationId, message, onClose }: { conversationId: string; message: Message | null; onClose: () => void }) {
  const t = useTranslations('messaging');
  const common = useTranslations('common');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { orgId } = useOrg();
  const [reason, setReason] = useState<ReportReasonKey>('HARASSMENT');
  const [note, setNote] = useState('');
  const submit = useMutation({
    mutationFn: () => api.org(orgId).messaging.conversations.report(conversationId, message!.id, { reason, note: note.trim() || undefined }),
    onSuccess: () => { toast(t('reportSent'), 'success'); onClose(); },
    onError: (e) => toast(e instanceof ApiError && e.code === 'CONFLICT' ? t('reportAlready') : errorMessage(e), 'error'),
  });
  return (
    <Dialog open={message !== null} onClose={onClose} title={t('reportTitle')} description={t('reportHint')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        {message && <blockquote className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{message.body || t('attachments')}</blockquote>}
        <label className="block space-y-1.5 text-sm font-medium">
          {t('reportReason')}
          <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReasonKey)}>
            {REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`reportReasons.${r}`)}</option>)}
          </Select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          {t('reportNote')}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={REPORT_NOTE_MAX} rows={3} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{common('cancel')}</Button>
          <Button type="submit" loading={submit.isPending}>{t('reportSubmit')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
