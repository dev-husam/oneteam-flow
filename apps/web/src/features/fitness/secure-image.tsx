'use client';

import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useOrg } from '@/lib/org/org-context';

/**
 * Shows a private photo. The image URL is a 60-second signed link requested only when the picture is shown (the
 * server checks access and audits sensitive reads), never stored. A refusal shows a quiet placeholder.
 */
export function SecureImage({ fileId, alt, className }: { fileId: string; alt: string; className?: string }) {
  const t = useTranslations('checkin');
  const { orgId } = useOrg();
  const link = useQuery({ queryKey: ['secure-image', orgId, fileId], queryFn: () => api.org(orgId).files.downloadUrl(fileId), staleTime: 30_000, gcTime: 30_000, retry: false });
  if (link.isPending) return <Skeleton className={cn('aspect-[3/4] w-full', className)} />;
  if (link.isError) {
    return (
      <div role="img" aria-label={t('photoUnavailable')} className={cn('grid aspect-[3/4] w-full place-items-center rounded-md border border-line bg-surface-2 text-muted', className)}>
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  return <img src={link.data.url} alt={alt} loading="lazy" className={cn('aspect-[3/4] w-full rounded-md border border-line object-cover', className)} />;
}
