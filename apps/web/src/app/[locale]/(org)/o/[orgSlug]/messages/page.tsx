import { getTranslations } from 'next-intl/server';
import { MessagesPage } from '@/features/messaging/messages-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('messages') };
}

export default function Page() {
  return <MessagesPage />;
}
