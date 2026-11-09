import { getTranslations } from 'next-intl/server';
import { RolesPage } from '@/features/org/roles-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('roles') };
}

export default function Page() {
  return <RolesPage />;
}
