'use client';

import { useQuery } from '@tanstack/react-query';
import { resolveDesign } from '@pt/domain';
import { BrandStyle } from '@/components/brand/brand-style';
import { useBrand } from '@/components/brand/brand-provider';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';
import { useOrganizationDesign } from './organization-design';

/** Which design is on screen: the person's own choice, else the open organization's design, else the platform default. */
export const MY_DESIGN_KEY = ['me', 'design'] as const;

/** The person's own choice (null when they follow the organization's or platform's design). */
export function useMyDesign() {
  const { status } = useAuth();
  return useQuery({ queryKey: MY_DESIGN_KEY, queryFn: () => api.me.design.current(), enabled: status === 'authenticated', staleTime: 5 * 60_000 });
}

/** Mounted once, inside the providers. Renders nothing when the platform default (already in the page head) is what applies. */
export function ActiveDesign() {
  const brand = useBrand();
  const org = useOrganizationDesign();
  const mine = useMyDesign();
  const personal = mine.data?.enabled ? mine.data.design : null;
  const active = resolveDesign({ platform: brand.design, org: org?.design ?? null, personal, personalAllowed: org?.personalAllowed ?? true });
  if (active.key === brand.design.key) return null;
  return <BrandStyle design={active} id="active-design" />;
}
