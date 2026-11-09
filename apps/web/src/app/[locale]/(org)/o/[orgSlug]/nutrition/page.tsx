import { getTranslations } from 'next-intl/server';
import { NutritionPage } from '@/features/fitness/nutrition-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('nutrition') };
}

export default function Page() {
  return <NutritionPage />;
}
