import { getTranslations } from 'next-intl/server';
import { PlansPage } from '@/features/fitness/plans-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('plans') };
}

export default function Page() {
  return <PlansPage />;
}
