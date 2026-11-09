import { describe, expect, it } from 'vitest';
import { renderMail, type MailTemplate } from './mail-templates.js';

const templates: MailTemplate[] = ['verify-email', 'reset-password', 'email-exists', 'password-changed'];

describe('renderMail', () => {
  it.each(templates)('renders %s in English and Arabic', (template) => {
    for (const locale of ['en', 'ar'] as const) {
      const mail = renderMail(template, locale, { name: 'Sara', link: 'https://app.example.com/x?token=abc' });
      expect(mail.subject.length).toBeGreaterThan(3);
      expect(mail.text).toContain('Sara');
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.html).toContain(locale === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
    }
  });

  it('includes the action link only for templates with an action', () => {
    expect(renderMail('verify-email', 'en', { name: 'A', link: 'https://x/y' }).text).toContain('https://x/y');
    expect(renderMail('password-changed', 'en', { name: 'A', link: 'https://x/y' }).text).not.toContain('https://x/y');
  });

  it('escapes HTML in names to prevent injection into the message', () => {
    const mail = renderMail('email-exists', 'en', { name: '<img src=x onerror=alert(1)>' });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img');
  });
});
