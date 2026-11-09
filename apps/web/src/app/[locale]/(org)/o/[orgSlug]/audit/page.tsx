import { getTranslations } from 'next-intl/server';
import { AuditPage } from '@/features/org/audit-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('audit') };
}

export default function Page() {
  return <AuditPage />;
}
