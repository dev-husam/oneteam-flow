import { getTranslations } from 'next-intl/server';
import { MessageReportsPage } from '@/features/messaging/message-reports-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('messageReports') };
}

export default function Page() {
  return <MessageReportsPage />;
}
