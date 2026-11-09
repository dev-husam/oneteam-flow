'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { AuditList } from './audit-list';

export function AuditPage() {
  const t = useTranslations('audit');
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card className="anim-rise">
        <AuditList />
      </Card>
    </>
  );
}
