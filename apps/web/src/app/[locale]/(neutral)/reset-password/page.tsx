import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { Suspense } from 'react';
import { ResetForm } from '@/features/auth/reset-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'auth.reset' });
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
