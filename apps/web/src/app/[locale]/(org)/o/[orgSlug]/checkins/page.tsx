import { getTranslations } from 'next-intl/server';
import { CheckinsPage } from '@/features/fitness/checkins-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('checkins') };
}

export default function Page() {
  return <CheckinsPage />;
}
