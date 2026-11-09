import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="space-y-4">
        <p className="text-5xl font-semibold text-link">404</p>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-muted">{t('body')}</p>
        <Link href="/dashboard" className={buttonVariants()}>
          {t('action')}
        </Link>
      </div>
    </div>
  );
}
