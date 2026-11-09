import { getTranslations } from 'next-intl/server';
import { ResourcesPage } from '@/features/coaching/resources-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('resources') };
}

export default function Page() {
  return <ResourcesPage />;
}
