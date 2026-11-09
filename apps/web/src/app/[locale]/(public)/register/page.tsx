import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { Suspense } from 'react';
import { RegisterForm } from '@/features/auth/register-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'auth.register' });
  return { title: t('title') };
}

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
