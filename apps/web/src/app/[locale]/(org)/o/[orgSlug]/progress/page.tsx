import { getTranslations } from 'next-intl/server';
import { ProgressPage } from '@/features/work/progress-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('progress') };
}

export default function Page() {
  return <ProgressPage />;
}
