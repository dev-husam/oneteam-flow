import { getTranslations } from 'next-intl/server';
import { OrgOverview } from '@/features/org/overview';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('overview') };
}

export default function Page() {
  return <OrgOverview />;
}
