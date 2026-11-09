import { getTranslations } from 'next-intl/server';
import { NutritionPlansPage } from '@/features/fitness/nutrition-plans-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('nutritionPlans') };
}

export default function Page() {
  return <NutritionPlansPage />;
}
