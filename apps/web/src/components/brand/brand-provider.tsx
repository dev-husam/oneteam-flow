'use client';

import type { DesignTheme, PublicConfig } from '@pt/domain';
import { useLocale } from 'next-intl';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { API_BASE } from '@/lib/public-config';

interface Brand {
  appName: string;
  tagline: string;
  supportEmail: string | null;
  /** The platform's default design (already applied in the page head). */
  design: DesignTheme;
  /** Absolute address of the uploaded logo, or null for the built-in mark. */
  logoSrc: string | null;
  registrationOpen: boolean;
  organizationCreationOpen: boolean;
}

const BrandCtx = createContext<Brand | null>(null);

/** The administrator-configured identity for the current language. */
export function BrandProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  const locale = useLocale() as 'en' | 'ar';
  const value = useMemo<Brand>(
    () => ({
      appName: config.identity.appName[locale],
      tagline: config.identity.tagline[locale],
      supportEmail: config.identity.supportEmail,
      design: config.design,
      logoSrc: config.logoUrl ? `${API_BASE}${config.logoUrl}` : null,
      registrationOpen: config.features.registration,
      organizationCreationOpen: config.features.organization_creation,
    }),
    [config, locale],
  );
  return <BrandCtx.Provider value={value}>{children}</BrandCtx.Provider>;
}

export function useBrand(): Brand {
  const brand = useContext(BrandCtx);
  if (!brand) throw new Error('useBrand must be used inside BrandProvider');
  return brand;
}
