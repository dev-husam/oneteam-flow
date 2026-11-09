import { getTranslations } from 'next-intl/server';
import { MemberDetail } from '@/features/org/member-detail';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('members') };
}

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <MemberDetail memberId={memberId} />;
}
