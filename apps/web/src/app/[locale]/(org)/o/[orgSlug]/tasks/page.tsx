import { getTranslations } from 'next-intl/server';
import { TasksPage } from '@/features/work/tasks-page';
import { localeOf } from '@/lib/locale';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('tasks') };
}

export default function Page() {
  return <TasksPage />;
}
