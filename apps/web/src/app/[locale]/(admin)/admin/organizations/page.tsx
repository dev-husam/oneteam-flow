import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminOrganizations } from '@/features/admin/admin-orgs';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('organizations') };
}

export default function Page() {
  return <AdminOrganizations />;
}
