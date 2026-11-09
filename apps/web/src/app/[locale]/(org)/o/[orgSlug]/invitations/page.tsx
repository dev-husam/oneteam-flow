import { getTranslations } from 'next-intl/server';
import { InvitationsPage } from '@/features/org/invitations-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('invitations') };
}

export default function Page() {
  return <InvitationsPage />;
}
