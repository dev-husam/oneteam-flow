import { getTranslations } from 'next-intl/server';
import { TemplatesPage } from '@/features/coaching/templates-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('assessments') };
}

export default function Page() {
  return <TemplatesPage />;
}
