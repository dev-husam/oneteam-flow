export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'app', 'www', 'auth', 'login', 'register', 'o', 'orgs', 'organizations', 'me', 'settings',
  'support', 'help', 'static', 'assets', 'health', 'docs', 'billing', 'invitations', 'account', 'null', 'undefined',
]);

/** Latin-only slug from a display name. Returns '' when nothing usable remains (e.g. Arabic-only names). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export const isValidSlug = (slug: string): boolean => SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
