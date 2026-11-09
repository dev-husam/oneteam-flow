import { getTranslations } from 'next-intl/server';
import { localeOf } from '@/lib/locale';
import { CreateOrganizationForm } from '@/features/account/create-org-form';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'orgs' });
  return { title: t('createTitle') };
}

export default function Page() {
  return <CreateOrganizationForm />;
}
