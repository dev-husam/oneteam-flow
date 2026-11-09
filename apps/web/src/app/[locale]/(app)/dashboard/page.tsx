import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { Dashboard } from '@/features/dashboard';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('dashboard') };
}

export default function Page() {
  return <Dashboard />;
}
