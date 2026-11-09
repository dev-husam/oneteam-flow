import { getTranslations } from 'next-intl/server';
import { ClientsPage } from '@/features/fitness/clients-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('clients') };
}

export default function Page() {
  return <ClientsPage />;
}
