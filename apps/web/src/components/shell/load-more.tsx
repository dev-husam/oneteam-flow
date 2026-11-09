'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function LoadMore({ hasNextPage, loading, onLoad }: { hasNextPage: boolean; loading: boolean; onLoad: () => void }) {
  const t = useTranslations('common');
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center border-t border-line p-3">
      <Button variant="ghost" size="sm" loading={loading} onClick={onLoad}>
        {t('loadMore')}
      </Button>
    </div>
  );
}
