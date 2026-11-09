import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminUsers } from '@/features/admin/admin-users';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('users') };
}

export default function Page() {
  return <AdminUsers />;
}
