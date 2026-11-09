import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { localeOf } from '@/lib/locale';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  setRequestLocale(locale);
  redirect({ href: '/dashboard', locale });
}
