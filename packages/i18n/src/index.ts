import { ar } from './ar.js';
import { en, type Messages } from './en.js';

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const DIRECTIONS: Record<Locale, 'ltr' | 'rtl'> = { en: 'ltr', ar: 'rtl' };

export const MESSAGES: Record<Locale, Messages> = { en, ar };

export { en, ar };
export type { Messages };
