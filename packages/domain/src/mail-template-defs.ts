/**
 * Editable e-mail templates. The default wording lives in the API (it must work with an empty database); an
 * administrator can override subject, body and button label per template and language. Placeholders look like
 * `{{name}}` and only the ones listed here may be used, so a typo is caught when saving rather than shipped.
 */
export const MAIL_TEMPLATE_KEYS = ['verify-email', 'reset-password', 'email-exists', 'password-changed', 'invitation', 'notification'] as const;
export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];
export const MAIL_LOCALES = ['en', 'ar'] as const;
export type MailTemplateLocale = (typeof MAIL_LOCALES)[number];

export const isMailTemplateKey = (k: string): k is MailTemplateKey => (MAIL_TEMPLATE_KEYS as readonly string[]).includes(k);

const COMMON = ['name', 'appName'] as const;
export const TEMPLATE_PLACEHOLDERS: Record<MailTemplateKey, readonly string[]> = {
  'verify-email': [...COMMON, 'link'],
  'reset-password': [...COMMON, 'link'],
  'email-exists': [...COMMON],
  'password-changed': [...COMMON],
  invitation: [...COMMON, 'orgName', 'inviterName', 'link'],
  notification: [...COMMON, 'title', 'body', 'link'],
};
/** Templates with a call-to-action button (their `link` goes on the button, not into the text). */
export const TEMPLATES_WITH_BUTTON: readonly MailTemplateKey[] = ['verify-email', 'reset-password', 'invitation', 'notification'];

export const TEMPLATE_LIMITS = { subject: 150, body: 3000, action: 40 } as const;

export interface MailTemplateText {
  subject: string;
  /** Paragraphs separated by a blank line. */
  body: string;
  /** Button label; empty for templates without a button. */
  action: string;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
export const placeholdersIn = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]!);

export type TemplateErrors = Partial<Record<keyof MailTemplateText, string>>;

export function validateTemplateText(key: MailTemplateKey, input: unknown): { ok: true; value: MailTemplateText } | { ok: false; errors: TemplateErrors } {
  const v = (input ?? {}) as Partial<Record<keyof MailTemplateText, unknown>>;
  const errors: TemplateErrors = {};
  const value: MailTemplateText = { subject: '', body: '', action: '' };
  const allowed = TEMPLATE_PLACEHOLDERS[key];
  for (const f of ['subject', 'body', 'action'] as const) {
    const raw = v[f];
    if (typeof raw !== 'string') { errors[f] = 'required'; continue; }
    const t = raw.replace(/\r\n/g, '\n').trim();
    if (t.length > TEMPLATE_LIMITS[f]) { errors[f] = 'too_long'; continue; }
    if (f !== 'action' && t === '') { errors[f] = 'required'; continue; }
    if (f === 'subject' && t.includes('\n')) { errors[f] = 'invalid'; continue; }
    if (placeholdersIn(t).some((p) => !allowed.includes(p))) { errors[f] = 'placeholder'; continue; }
    // Only the button carries the link; a bare link in the text would be duplicated and untracked.
    if (f !== 'action' && placeholdersIn(t).includes('link')) { errors[f] = 'link_in_text'; continue; }
    value[f] = t;
  }
  const hasButton = TEMPLATES_WITH_BUTTON.includes(key);
  if (!errors.action) {
    if (hasButton && value.action === '') errors.action = 'required';
    if (!hasButton && value.action !== '') errors.action = 'no_button';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Replaces placeholders. `escape` (HTML output) is applied to BOTH the template's own text and the substituted
 * values: an administrator's wording is text, never markup.
 */
export function fillTemplate(text: string, vars: Readonly<Record<string, string | undefined>>, fallbacks: Readonly<Record<string, string>>, escape: (s: string) => string = (s) => s): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    out += escape(text.slice(last, m.index)) + escape(vars[m[1]!] ?? fallbacks[m[1]!] ?? '');
    last = m.index + m[0].length;
  }
  return out + escape(text.slice(last));
}
