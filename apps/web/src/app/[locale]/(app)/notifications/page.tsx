import { getTranslations } from 'next-intl/server';
import { NotificationsPage } from '@/features/notifications/notifications-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'inbox' });
  return { title: t('title') };
}

export default function Page() {
  return <NotificationsPage />;
}
