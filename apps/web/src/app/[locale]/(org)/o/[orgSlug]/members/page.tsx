import { getTranslations } from 'next-intl/server';
import { MembersPage } from '@/features/org/members-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('members') };
}

export default function Page() {
  return <MembersPage />;
}
