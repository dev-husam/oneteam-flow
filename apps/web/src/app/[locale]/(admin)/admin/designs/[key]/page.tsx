import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminDesignEditor } from '@/features/admin/admin-designs';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('designs') };
}

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <AdminDesignEditor designKey={key} />;
}
