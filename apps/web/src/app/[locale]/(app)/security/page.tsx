import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { SecurityPage } from '@/features/security-page';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('security') };
}

export default function Page() {
  return <SecurityPage />;
}
