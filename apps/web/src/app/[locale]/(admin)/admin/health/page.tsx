import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminHealthPage } from '@/features/admin/admin-health';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('health') };
}

export default function Page() {
  return <AdminHealthPage />;
}
