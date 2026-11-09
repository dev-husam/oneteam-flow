'use client';

import { LogoMark } from '@/components/ui/logo';
import { useBrand } from './brand-provider';

/** The uploaded logo when there is one, otherwise the built-in mark. */
export function BrandLogo({ className }: { className?: string }) {
  const { logoSrc } = useBrand();
  if (!logoSrc) return <LogoMark className={className} />;
  return <img src={logoSrc} alt="" className={`${className ?? 'size-8'} rounded-md object-contain`} />;
}
