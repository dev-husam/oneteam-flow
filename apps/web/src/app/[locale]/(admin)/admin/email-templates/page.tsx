import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AdminEmailTemplatesPage } from '@/features/admin/admin-email-templates';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'admin.nav' });
  return { title: t('emailTemplates') };
}

export default function Page() {
  return <AdminEmailTemplatesPage />;
}
