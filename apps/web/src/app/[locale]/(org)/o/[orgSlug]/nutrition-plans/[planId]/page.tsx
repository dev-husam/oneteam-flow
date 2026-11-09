import { getTranslations } from 'next-intl/server';
import { NutritionPlanEditor } from '@/features/fitness/nutrition-plan-editor';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('nutritionPlans') };
}

export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <NutritionPlanEditor planId={planId} />;
}
