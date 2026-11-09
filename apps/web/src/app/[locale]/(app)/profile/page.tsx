import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { AppearanceCard } from '@/features/profile/appearance-card';
import { ProfileForm } from '@/features/profile-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('profile') };
}

export default function Page() {
  return (
    <>
      <ProfileForm />
      <AppearanceCard />
    </>
  );
}
