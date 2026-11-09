'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { errorReference, useErrorMessage } from '@/lib/errors';

/** One place that renders any API failure as a localized, accessible message. */
export function ErrorAlert({ error }: { error: unknown }) {
  const t = useTranslations('errors');
  const message = useErrorMessage();
  const reference = errorReference(error);
  return (
    <Alert tone="danger">
      {message(error)}
      {reference && <span className="ltr-isolate mt-1 block text-xs text-muted">{t('reference', { requestId: reference })}</span>}
    </Alert>
  );
}
