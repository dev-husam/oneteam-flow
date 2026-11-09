import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AcceptInvitation } from '@/features/account/accept-invitation';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'invite' });
  return { title: t('pageTitle') };
}

export default function Page() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
