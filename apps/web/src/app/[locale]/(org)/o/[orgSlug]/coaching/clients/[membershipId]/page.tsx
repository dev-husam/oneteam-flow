import { getTranslations } from 'next-intl/server';
import { ClientWorkspace } from '@/features/coaching/coaching-pages';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('coaching') };
}

export default async function Page({ params }: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await params;
  return <ClientWorkspace membershipId={membershipId} />;
}
