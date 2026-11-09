import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { Suspense } from 'react';
import { VerifyEmail } from '@/features/auth/verify-email';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'auth.verify' });
  return { title: t('successTitle') };
}

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
