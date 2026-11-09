import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminFeatures } from '@/features/admin/admin-features';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('features') };
}

export default function Page() {
  return <AdminFeatures />;
}
