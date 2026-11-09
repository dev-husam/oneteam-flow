import { getTranslations } from 'next-intl/server';
import { GroupsPage } from '@/features/org/groups-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('groups') };
}

export default function Page() {
  return <GroupsPage />;
}
