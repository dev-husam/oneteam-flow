import { getTranslations } from 'next-intl/server';
import { ExercisesPage } from '@/features/fitness/exercises-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('exercises') };
}

export default function Page() {
  return <ExercisesPage />;
}
