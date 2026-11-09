'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DesignPreview } from '@/components/brand/design-preview';
import { useBrand } from '@/components/brand/brand-provider';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { MY_DESIGN_KEY } from '@/lib/design/active-design';
import { useErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

/** Profile → Appearance: pick one of the designs the administrator made available, or follow the default. Applies at once, to this person only. */
export function AppearanceCard() {
  const t = useTranslations('appearance');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const brand = useBrand();
  const options = useQuery({ queryKey: ['me', 'designs'], queryFn: () => api.me.design.options() });
  const choose = useMutation({
    mutationFn: (key: string | null) => api.me.design.choose(key),
    onSuccess: async (mine) => {
      queryClient.setQueryData(MY_DESIGN_KEY, mine);
      await queryClient.invalidateQueries({ queryKey: ['me', 'designs'] });
      toast(t('saved'));
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  // Nothing to choose from (switched off, or no design is offered): the card stays out of the way.
  if (options.data && (!options.data.enabled || options.data.designs.length === 0)) return null;
  const selected = options.data?.selectedKey ?? null;
  const fallback = options.data?.designs.find((d) => d.key === options.data?.platformDefaultKey) ?? brand.design;

  return (
    <Card className="anim-rise mt-6">
      <CardHeader><CardTitle>{t('title')}</CardTitle><p className="text-sm text-muted">{t('subtitle')}</p></CardHeader>
      <CardBody className="space-y-4">
        {options.isPending && <Skeleton className="h-40" />}
        {options.isError && <ErrorAlert error={options.error} />}
        {options.data && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={t('title')}>
            {[null, ...options.data.designs].map((d) => {
              const key = d?.key ?? null;
              const on = selected === key;
              const shown = d ?? fallback;
              return (
                <li key={key ?? 'default'}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={choose.isPending}
                    onClick={() => !on && choose.mutate(key)}
                    className={cn('block w-full space-y-3 rounded-lg border p-3 text-start transition-colors', on ? 'border-focus bg-selection' : 'border-line bg-surface hover:border-line-strong')}
                  >
                    <DesignPreview design={shown} mode="light" compact />
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d ? d.name : t('followDefault')}</span>
                      {on && <Badge tone="ok"><Check className="size-3" aria-hidden /> {t('inUse')}</Badge>}
                    </span>
                    <span className="block text-xs text-muted">{d ? d.description : t('followDefaultHint')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted">{t('note')}</p>
        {selected !== null && <Button size="sm" variant="secondary" loading={choose.isPending} onClick={() => choose.mutate(null)}>{t('followDefault')}</Button>}
      </CardBody>
    </Card>
  );
}
