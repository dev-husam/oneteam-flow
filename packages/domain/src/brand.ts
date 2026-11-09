import { FALLBACK_DESIGN, parseDesignTheme, type DesignTheme } from './design.js';

/** Identity and mail branding the administrator can change. Texts are bilingual; empty fields fall back to defaults. */
export interface Bilingual {
  en: string;
  ar: string;
}

export interface IdentitySettings {
  appName: Bilingual;
  tagline: Bilingual;
  supportEmail: string | null;
}
export interface MailBrandSettings {
  /** Display name in the From header. The sending address itself is infrastructure (DNS-verified), not a setting. */
  fromName: string;
  /** Short line under every e-mail. */
  footer: Bilingual;
}

export const DEFAULT_IDENTITY: IdentitySettings = {
  appName: { en: 'Personal Trainer', ar: 'المدرب الشخصي' },
  tagline: { en: 'Run your coaching business and track every client’s progress.', ar: 'أدِر عملك في التدريب وتابع تقدّم كل عميل.' },
  supportEmail: null,
};
export const DEFAULT_MAIL_BRAND: MailBrandSettings = { fromName: '', footer: { en: '', ar: '' } };

export const IDENTITY_LIMITS = { appName: 40, tagline: 160, footer: 240, fromName: 60 } as const;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length <= max ? v.trim() : null);
const hasMarkup = (s: string) => /[<>\r\n]/.test(s);

function bilingual(input: unknown, field: string, max: number, required: boolean, errors: Record<string, string>, fallback: Bilingual): Bilingual {
  const v = (input ?? {}) as Partial<Bilingual>;
  const out = { ...fallback };
  for (const l of ['en', 'ar'] as const) {
    if (v[l] === undefined) continue;
    const t = text(v[l], max);
    if (t === null || hasMarkup(t)) errors[`${field}.${l}`] = 'invalid';
    else if (t === '' && required) errors[`${field}.${l}`] = 'required';
    else out[l] = t;
  }
  return out;
}

export function validateIdentity(input: unknown): Result<IdentitySettings> {
  const v = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const appName = bilingual(v.appName, 'appName', IDENTITY_LIMITS.appName, true, errors, DEFAULT_IDENTITY.appName);
  const tagline = bilingual(v.tagline, 'tagline', IDENTITY_LIMITS.tagline, false, errors, DEFAULT_IDENTITY.tagline);
  let supportEmail = DEFAULT_IDENTITY.supportEmail;
  if (v.supportEmail !== undefined && v.supportEmail !== null && v.supportEmail !== '') {
    if (typeof v.supportEmail !== 'string' || !EMAIL.test(v.supportEmail.trim()) || v.supportEmail.length > 254) errors.supportEmail = 'email';
    else supportEmail = v.supportEmail.trim().toLowerCase();
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { appName, tagline, supportEmail } };
}

export function validateMailBrand(input: unknown): Result<MailBrandSettings> {
  const v = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  let fromName = DEFAULT_MAIL_BRAND.fromName;
  if (v.fromName !== undefined) {
    const t = text(v.fromName, IDENTITY_LIMITS.fromName);
    if (t === null || hasMarkup(t)) errors.fromName = 'invalid';
    else fromName = t;
  }
  const footer = bilingual(v.footer, 'footer', IDENTITY_LIMITS.footer, false, errors, DEFAULT_MAIL_BRAND.footer);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { fromName, footer } };
}

/** What every client may know before signing in. */
export interface PublicConfig {
  identity: IdentitySettings;
  /** The platform's default design (an organization may override it after sign-in). */
  design: DesignTheme;
  logoUrl: string | null;
  features: { registration: boolean; organization_creation: boolean };
}

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  identity: DEFAULT_IDENTITY,
  design: FALLBACK_DESIGN,
  logoUrl: null,
  features: { registration: true, organization_creation: true },
};

/**
 * Clients (web, mobile) never trust what the server or a local cache hands them: every part is re-validated and
 * anything wrong falls back to the built-in default, so a damaged setting can not break a screen or smuggle odd values into styles.
 */
export function parsePublicConfig(input: unknown): PublicConfig {
  const d = (input ?? {}) as Partial<Record<keyof PublicConfig, unknown>>;
  const identity = validateIdentity(d.identity);
  const features = (d.features ?? {}) as Partial<Record<'registration' | 'organization_creation', unknown>>;
  return {
    identity: identity.ok ? identity.value : DEFAULT_IDENTITY,
    design: parseDesignTheme(d.design) ?? FALLBACK_DESIGN,
    logoUrl: typeof d.logoUrl === 'string' && /^\/config\/logo\?v=[0-9a-f]{1,32}$/.test(d.logoUrl) ? d.logoUrl : null,
    features: { registration: features.registration !== false, organization_creation: features.organization_creation !== false },
  };
}

/** Logo upload rules: small raster images only (no SVG: it can carry scripts). */
export const LOGO_MAX_BYTES = 64 * 1024;
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
