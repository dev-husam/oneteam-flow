import { DEFAULT_PUBLIC_CONFIG, parsePublicConfig, type PublicConfig } from '@pt/domain';

/** Used when the API is unreachable (build time, outage): the app still renders with its built-in identity and theme. */
export const FALLBACK_CONFIG: PublicConfig = DEFAULT_PUBLIC_CONFIG;

export const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/**
 * Server-side read of the public configuration (name, theme, logo, open sign-up). Cached for 30 seconds, so a
 * change made in the admin console shows up on the next page load after that. Anything unexpected falls back to the
 * defaults: a broken setting can never take the site down, and the theme values are re-validated before they reach CSS.
 */
export async function loadPublicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${API_BASE}/config/public`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return FALLBACK_CONFIG;
    const body = (await res.json()) as { data?: unknown };
    return parsePublicConfig(body.data);
  } catch {
    return FALLBACK_CONFIG;
  }
}
