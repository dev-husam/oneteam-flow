import {
  fillTemplate, TEMPLATES_WITH_BUTTON, type MailTemplateKey, type MailTemplateLocale, type MailTemplateText,
} from '@pt/domain';

export type MailTemplate = MailTemplateKey;
export type MailLocale = MailTemplateLocale;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export interface Vars {
  name: string;
  link?: string;
  orgName?: string;
  inviterName?: string;
  title?: string;
  body?: string;
  appName?: string;
}

/** Shown around the template: the app name and the footer line the administrator configured. */
export interface MailBranding {
  appName: string;
  footer?: string;
  /** Button colour and the text colour on it (the design's primary action). */
  accent?: string;
  accentText?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Built-in wording, in the same placeholder format an administrator edits (`{{name}}`; paragraphs separated by a
 * blank line). It works with an empty database; an administrator's override replaces a template wholesale.
 */
export const DEFAULT_MAIL_TEXT: Record<MailLocale, Record<MailTemplate, MailTemplateText>> = {
  en: {
    'verify-email': { subject: 'Confirm your email address', body: 'Hi {{name}},\n\nPlease confirm your email address to finish setting up your account. The link is valid for 24 hours.', action: 'Confirm email' },
    'reset-password': { subject: 'Reset your password', body: 'Hi {{name}},\n\nWe received a request to reset your password. The link is valid for 1 hour. If this was not you, you can ignore this message.', action: 'Choose a new password' },
    'email-exists': { subject: 'Someone tried to register with your email', body: 'Hi {{name}},\n\nSomeone tried to create an account with your email address, but you already have one. If it was you, simply sign in or reset your password. Otherwise no action is needed.', action: '' },
    invitation: { subject: '{{orgName}} invited you to join', body: 'Hi {{name}},\n\n{{inviterName}} invited you to join {{orgName}}. The invitation is valid for 7 days. Sign in or create an account with this email address to accept it.', action: 'View invitation' },
    notification: { subject: '{{title}}', body: 'Hi {{name}},\n\n{{body}}', action: 'Open' },
    'password-changed': { subject: 'Your password was changed', body: 'Hi {{name}},\n\nYour password was just changed and all devices were signed out. If this was not you, reset your password immediately and contact support.', action: '' },
  },
  ar: {
    'verify-email': { subject: 'أكّد بريدك الإلكتروني', body: 'مرحبًا {{name}}،\n\nيرجى تأكيد بريدك الإلكتروني لإكمال إعداد حسابك. الرابط صالح لمدة 24 ساعة.', action: 'تأكيد البريد' },
    'reset-password': { subject: 'إعادة تعيين كلمة المرور', body: 'مرحبًا {{name}}،\n\nتلقينا طلبًا لإعادة تعيين كلمة المرور. الرابط صالح لمدة ساعة واحدة. إذا لم تكن أنت من طلب ذلك فتجاهل هذه الرسالة.', action: 'اختيار كلمة مرور جديدة' },
    'email-exists': { subject: 'حاول شخص ما التسجيل ببريدك الإلكتروني', body: 'مرحبًا {{name}}،\n\nحاول شخص ما إنشاء حساب ببريدك الإلكتروني لكن لديك حساب بالفعل. إن كنت أنت فسجّل الدخول أو أعد تعيين كلمة المرور، وإلا فلا إجراء مطلوب.', action: '' },
    invitation: { subject: 'دعتك {{orgName}} للانضمام', body: 'مرحبًا {{name}}،\n\n{{inviterName}} دعاك للانضمام إلى {{orgName}}. الدعوة صالحة لمدة 7 أيام. سجّل الدخول أو أنشئ حسابًا بهذا البريد الإلكتروني لقبولها.', action: 'عرض الدعوة' },
    notification: { subject: '{{title}}', body: 'مرحبًا {{name}}،\n\n{{body}}', action: 'فتح' },
    'password-changed': { subject: 'تم تغيير كلمة المرور', body: 'مرحبًا {{name}}،\n\nتم تغيير كلمة المرور وتسجيل الخروج من جميع الأجهزة. إن لم تكن أنت، أعد تعيين كلمة المرور فورًا وتواصل مع الدعم.', action: '' },
  },
};

/** What a placeholder becomes when the sender did not supply it. */
const FALLBACKS: Record<MailLocale, Record<string, string>> = {
  en: { orgName: 'an organization', inviterName: 'Someone', title: 'Notification', body: '', appName: 'Personal Trainer' },
  ar: { orgName: 'منظمة', inviterName: 'أحدهم', title: 'إشعار', body: '', appName: 'المدرب الشخصي' },
};

export const defaultMailText = (template: MailTemplate, locale: MailLocale): MailTemplateText => DEFAULT_MAIL_TEXT[locale][template];

export function renderMail(
  template: MailTemplate,
  locale: MailLocale,
  vars: Vars,
  opts: { text?: MailTemplateText | null; branding?: MailBranding } = {},
): RenderedMail {
  const source = opts.text ?? DEFAULT_MAIL_TEXT[locale][template];
  const branding = opts.branding;
  const values: Record<string, string | undefined> = { ...vars, appName: vars.appName ?? branding?.appName };
  // The link belongs on the button; it is only offered where the template has one.
  const hasButton = TEMPLATES_WITH_BUTTON.includes(template) && source.action !== '' && Boolean(vars.link);
  const fallbacks = FALLBACKS[locale];

  const paragraphs = source.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const textParagraphs = paragraphs.map((p) => fillTemplate(p, values, fallbacks));
  const htmlParagraphs = paragraphs.map((p) => fillTemplate(p, values, fallbacks, escapeHtml));
  const footer = branding?.footer?.trim();

  const text = [...textParagraphs, ...(hasButton ? [`${source.action}: ${vars.link}`] : []), ...(footer ? [`--\n${footer}`] : [])].join('\n\n');
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const accent = branding?.accent && /^#[0-9a-f]{6}$/i.test(branding.accent) ? branding.accent : '#1f2a44';
  const accentText = branding?.accentText && /^#[0-9a-f]{6}$/i.test(branding.accentText) ? branding.accentText : '#ffffff';
  const body = htmlParagraphs.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const button = hasButton
    ? `<p><a href="${escapeHtml(vars.link!)}" style="display:inline-block;padding:10px 18px;background:${accent};color:${accentText};border-radius:6px;text-decoration:none">${escapeHtml(source.action)}</a></p><p dir="ltr" style="color:#667;font-size:12px">${escapeHtml(vars.link!)}</p>`
    : '';
  const foot = footer ? `<p style="color:#667;font-size:12px;border-top:1px solid #e0e4ea;padding-top:12px">${escapeHtml(footer)}</p>` : '';
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#1b1f2a">${body}${button}${foot}</body></html>`;
  return { subject: fillTemplate(source.subject, values, fallbacks).replace(/\s+/g, ' ').trim(), text, html };
}
