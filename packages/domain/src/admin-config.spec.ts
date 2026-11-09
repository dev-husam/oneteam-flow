import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLIC_CONFIG, parsePublicConfig, validateIdentity, validateMailBrand } from './brand.js';
import { BUILT_IN_DESIGNS } from './design.js';
import { effectiveFeature, FEATURE_FLAGS, FEATURE_KEYS, ORG_FEATURE_KEYS } from './features.js';
import { fillTemplate, MAIL_TEMPLATE_KEYS, placeholdersIn, TEMPLATE_PLACEHOLDERS, validateTemplateText } from './mail-template-defs.js';
import { visibleNavigation, CORE_NAVIGATION } from './navigation.js';

describe('feature flags', () => {
  it('keys are unique and platform flags cannot be overridden per organization', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_FLAGS.length);
    expect(effectiveFeature('messaging', true, false)).toBe(false);
    expect(effectiveFeature('messaging', false, true)).toBe(true); // a beta for one organization
    expect(effectiveFeature('messaging', true, null)).toBe(true);
    expect(effectiveFeature('registration', true, false)).toBe(true); // platform flag: override ignored
    expect(ORG_FEATURE_KEYS).not.toContain('registration');
  });
  it('navigation hides items of a feature that is off, and keeps them when the map says nothing', () => {
    const keys = (f: Record<string, boolean>) =>
      visibleNavigation(CORE_NAVIGATION, { 'message.send': 'ORG', 'message.moderate': 'ORG' }, [], f).map((i) => i.key);
    expect(keys({ messaging: false })).not.toContain('messages');
    expect(keys({ messaging: false })).not.toContain('message-reports');
    expect(keys({})).toContain('messages');
  });
});

describe('identity and mail branding', () => {
  it('requires an app name in both languages and rejects markup', () => {
    expect(validateIdentity({ appName: { en: '', ar: 'س' } })).toEqual({ ok: false, errors: { 'appName.en': 'required' } });
    expect(validateIdentity({ appName: { en: '<b>X</b>' } })).toMatchObject({ ok: false });
    const ok = validateIdentity({ appName: { en: 'Atlas', ar: 'أطلس' }, supportEmail: ' Help@Atlas.TEST ' });
    expect(ok).toMatchObject({ ok: true, value: { appName: { en: 'Atlas', ar: 'أطلس' }, supportEmail: 'help@atlas.test' } });
    expect(validateIdentity({ supportEmail: 'nope' })).toEqual({ ok: false, errors: { supportEmail: 'email' } });
  });
  it('mail branding accepts a sender name and footers', () => {
    expect(validateMailBrand({ fromName: 'Atlas Team', footer: { en: 'Atlas, Riyadh' } })).toMatchObject({ ok: true, value: { fromName: 'Atlas Team' } });
    expect(validateMailBrand({ fromName: 'a\nb' })).toMatchObject({ ok: false });
  });
});

describe('e-mail templates', () => {
  it('every template has placeholders and they are found in text', () => {
    for (const k of MAIL_TEMPLATE_KEYS) expect(TEMPLATE_PLACEHOLDERS[k]).toContain('name');
    expect(placeholdersIn('Hi {{name}}, {{ appName }}')).toEqual(['name', 'appName']);
  });
  it('validates placeholders, the button and the link rules', () => {
    const ok = { subject: 'Welcome to {{appName}}', body: 'Hi {{name}},\n\nConfirm your address.', action: 'Confirm' };
    expect(validateTemplateText('verify-email', ok)).toMatchObject({ ok: true });
    expect(validateTemplateText('verify-email', { ...ok, subject: '{{orgName}}' })).toEqual({ ok: false, errors: { subject: 'placeholder' } });
    expect(validateTemplateText('verify-email', { ...ok, body: 'Open {{link}}' })).toEqual({ ok: false, errors: { body: 'link_in_text' } });
    expect(validateTemplateText('verify-email', { ...ok, action: '' })).toEqual({ ok: false, errors: { action: 'required' } });
    expect(validateTemplateText('password-changed', { ...ok, action: 'Go' })).toEqual({ ok: false, errors: { action: 'no_button' } });
    expect(validateTemplateText('password-changed', { subject: 'Changed', body: 'Done', action: '' })).toMatchObject({ ok: true });
    expect(validateTemplateText('verify-email', { ...ok, subject: 'a\nb' })).toEqual({ ok: false, errors: { subject: 'invalid' } });
  });
  it('escapes both the template text and the substituted values', () => {
    const esc = (s: string) => s.replace(/</g, '&lt;');
    expect(fillTemplate('Hi {{name}} <b>', { name: '<i>Sam</i>' }, {}, esc)).toBe('Hi &lt;i>Sam&lt;/i> &lt;b>');
    expect(fillTemplate('{{orgName}}!', {}, { orgName: 'an organization' })).toBe('an organization!');
  });
});

describe('public configuration parsing', () => {
  it('falls back to the defaults for anything missing or damaged', () => {
    expect(parsePublicConfig(undefined)).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(parsePublicConfig({ design: { ...BUILT_IN_DESIGNS[0], light: { ...BUILT_IN_DESIGNS[0]!.light, actionPrimary: 'url(javascript:1)' } }, identity: { appName: { en: '<b>' } }, logoUrl: 'https://evil.test/x.png' })).toEqual(DEFAULT_PUBLIC_CONFIG);
  });
  it('keeps valid values and only relative logo addresses', () => {
    const c = parsePublicConfig({ identity: { appName: { en: 'Atlas', ar: 'أطلس' } }, design: { ...BUILT_IN_DESIGNS[1] }, logoUrl: '/config/logo?v=abc123def456', features: { registration: false } });
    expect(c.identity.appName.en).toBe('Atlas');
    expect(c.design.key).toBe('classic');
    expect(c.logoUrl).toBe('/config/logo?v=abc123def456');
    expect(c.features).toEqual({ registration: false, organization_creation: true });
  });
});
