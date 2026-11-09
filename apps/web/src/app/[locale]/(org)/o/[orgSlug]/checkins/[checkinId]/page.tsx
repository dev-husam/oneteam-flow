import { getTranslations } from 'next-intl/server';
import { CheckinDetail } from '@/features/fitness/checkin-detail';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('checkins') };
}

export default async function Page({ params }: { params: Promise<{ checkinId: string }> }) {
  const { checkinId } = await params;
  return <CheckinDetail checkinId={checkinId} />;
}
