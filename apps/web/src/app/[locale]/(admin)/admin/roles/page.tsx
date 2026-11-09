import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminRoles } from '@/features/admin/admin-roles';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('roles') };
}

export default function Page() {
  return <AdminRoles />;
}
