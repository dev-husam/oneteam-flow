import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminSettingsPage } from '@/features/admin/admin-settings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('settings') };
}

export default function Page() {
  return <AdminSettingsPage />;
}
