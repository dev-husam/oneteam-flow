import { getTranslations } from 'next-intl/server';
import { SettingsPage } from '@/features/org/settings-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('settings') };
}

export default function Page() {
  return <SettingsPage />;
}
