import { getTranslations } from 'next-intl/server';
import { CheckinPage } from '@/features/fitness/checkin-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('checkin') };
}

export default function Page() {
  return <CheckinPage />;
}
