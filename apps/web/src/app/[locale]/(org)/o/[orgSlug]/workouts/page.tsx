import { getTranslations } from 'next-intl/server';
import { WorkoutsPage } from '@/features/fitness/workouts-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('workouts') };
}

export default function Page() {
  return <WorkoutsPage />;
}
