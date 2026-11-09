import { getTranslations } from 'next-intl/server';
import { CoachingHome } from '@/features/coaching/coaching-pages';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('coaching') };
}

export default function Page() {
  return <CoachingHome />;
}
