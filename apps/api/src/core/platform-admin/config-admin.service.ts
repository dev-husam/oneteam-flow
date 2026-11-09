import { Inject, Injectable } from '@nestjs/common';
import {
  FEATURE_FLAGS, featureDefinition, isFeatureKey, isMailTemplateKey, LOGO_MAX_BYTES, LOGO_MIME_TYPES, MAIL_LOCALES, MAIL_TEMPLATE_KEYS,
  TEMPLATE_PLACEHOLDERS, TEMPLATES_WITH_BUTTON, validateIdentity, validateMailBrand, validateTemplateText,
  type MailTemplateKey, type MailTemplateLocale, type MailTemplateText,
} from '@pt/domain';
import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { defaultMailText, renderMail } from '../../infra/mail/mail-templates.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { DesignService } from '../../infra/platform-config/design.service.js';
import { MailTemplatesService } from '../../infra/platform-config/mail-templates.service.js';
import { PlatformConfigService, type SettingKey } from '../../infra/platform-config/platform-config.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { FeaturesService } from '../rbac/features.service.js';

/** Sample values for previews and test e-mails. */
const SAMPLE = { name: 'Sara', orgName: 'Atlas Fitness', inviterName: 'Layla', title: 'New message', body: 'You have a new message from your trainer.', link: 'https://example.com/open' };

const hasMagic = (buf: Buffer, mime: string): boolean =>
  mime === 'image/png' ? buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  : mime === 'image/jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  : mime === 'image/webp' ? buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP'
  : false;

/**
 * Everything an administrator configures: feature flags (platform value and per-organization overrides), identity,
 * theme, mail branding, the logo and e-mail templates. Each write is validated by the shared domain rules and
 * audited as SUPER_ADMIN. Nothing here reads tenant data.
 */
@Injectable()
export class ConfigAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
    @Inject(PlatformConfigService) private readonly platform: PlatformConfigService,
    @Inject(MailTemplatesService) private readonly templates: MailTemplatesService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(DesignService) private readonly designs: DesignService,
  ) {}

  private auditAdmin(actorUserId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>, orgId?: string, tx?: unknown) {
    return this.audit.record({ action, actorUserId, actorType: 'SUPER_ADMIN', organizationId: orgId ?? null, targetType, targetId, metadata }, tx);
  }

  // ------------------------------------------------------------------ feature flags

  async listFlags() {
    const [rows, overrides] = await Promise.all([this.prisma.featureFlag.findMany(), this.prisma.organizationFeatureOverride.groupBy({ by: ['flagKey'], _count: { _all: true } })]);
    const enabled = new Map(rows.map((r) => [r.key, r.enabled]));
    const counts = new Map(overrides.map((o) => [o.flagKey, o._count._all]));
    return FEATURE_FLAGS.map((f) => ({
      key: f.key, scope: f.scope, group: f.group, description: f.description, defaultEnabled: f.defaultEnabled,
      enabled: enabled.get(f.key) ?? f.defaultEnabled, overrideCount: counts.get(f.key) ?? 0,
    }));
  }

  async setFlag(actorId: string, key: string, enabled: boolean) {
    if (!isFeatureKey(key)) throw new AppError('NOT_FOUND');
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlag.upsert({ where: { key }, create: { key, enabled, updatedByUserId: actorId }, update: { enabled, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.flag_changed', 'feature_flag', key, { key, from: before?.enabled ?? featureDefinition(key).defaultEnabled, to: enabled }, undefined, tx);
    });
    this.features.invalidate();
    return (await this.listFlags()).find((f) => f.key === key)!;
  }

  private async requireOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw new AppError('NOT_FOUND');
  }

  async organizationFlags(organizationId: string) {
    await this.requireOrganization(organizationId);
    const [platform, overrides] = await Promise.all([this.prisma.featureFlag.findMany(), this.prisma.organizationFeatureOverride.findMany({ where: { organizationId } })]);
    const platformValue = new Map(platform.map((r) => [r.key, r.enabled]));
    const override = new Map(overrides.map((o) => [o.flagKey, o.enabled]));
    const map = await this.features.mapFor(organizationId);
    return FEATURE_FLAGS.filter((f) => f.scope === 'ORGANIZATION').map((f) => ({
      key: f.key, group: f.group, description: f.description,
      platformEnabled: platformValue.get(f.key) ?? f.defaultEnabled, override: override.get(f.key) ?? null, effective: map[f.key],
    }));
  }

  /** `enabled: null` removes the override so the organization follows the platform value again. */
  async setOrganizationFlag(actorId: string, organizationId: string, key: string, enabled: boolean | null) {
    await this.requireOrganization(organizationId);
    if (!isFeatureKey(key) || featureDefinition(key).scope !== 'ORGANIZATION') throw new AppError('NOT_FOUND');
    const before = await this.prisma.organizationFeatureOverride.findUnique({ where: { organizationId_flagKey: { organizationId, flagKey: key } } });
    await this.prisma.$transaction(async (tx) => {
      if (enabled === null) await tx.organizationFeatureOverride.deleteMany({ where: { organizationId, flagKey: key } });
      else await tx.organizationFeatureOverride.upsert({ where: { organizationId_flagKey: { organizationId, flagKey: key } }, create: { organizationId, flagKey: key, enabled, updatedByUserId: actorId }, update: { enabled, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.flag_override_changed', 'organization', organizationId, { key, from: before?.enabled ?? null, to: enabled }, organizationId, tx);
    });
    this.features.invalidate(organizationId);
    return (await this.organizationFlags(organizationId)).find((f) => f.key === key)!;
  }

  // ------------------------------------------------------------------ identity, theme, mail branding, logo

  async settings() {
    const [identity, mail, logo] = await Promise.all([this.platform.identity(), this.platform.mailBrand(), this.platform.logoAsset()]);
    return { identity, mail, logo: logo ? { mimeType: logo.mimeType, sizeBytes: logo.data.length, updatedAt: logo.updatedAt, url: `/config/logo?v=${logo.sha256.slice(0, 12)}` } : null };
  }

  async saveSetting(actorId: string, key: SettingKey, body: unknown) {
    const current = (await this.settings())[key] as unknown as Record<string, unknown>;
    const incoming = (body ?? {}) as Record<string, unknown>;
    // Merge so a client may send only what changed; bilingual objects merge per language.
    const merged: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      merged[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof current[k] === 'object' && current[k] !== null ? { ...(current[k] as object), ...v } : v;
    }
    const result = key === 'identity' ? validateIdentity(merged) : validateMailBrand(merged);
    if (!result.ok) throw new AppError('SETTINGS_INVALID', { fields: result.errors });
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({ where: { key }, create: { key, value: result.value as never, updatedByUserId: actorId }, update: { value: result.value as never, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.settings_changed', 'settings', key, { section: key, fields: Object.keys(incoming) }, undefined, tx);
    });
    this.platform.invalidate();
    return (await this.settings())[key];
  }

  async setLogo(actorId: string, mimeType: unknown, dataBase64: unknown) {
    if (typeof mimeType !== 'string' || !(LOGO_MIME_TYPES as readonly string[]).includes(mimeType) || typeof dataBase64 !== 'string') throw new AppError('LOGO_INVALID');
    const data = Buffer.from(dataBase64, 'base64');
    if (data.length === 0 || data.length > LOGO_MAX_BYTES || !hasMagic(data, mimeType)) throw new AppError('LOGO_INVALID');
    const sha256 = createHash('sha256').update(data).digest('hex');
    await this.prisma.$transaction(async (tx) => {
      await tx.platformAsset.upsert({ where: { key: 'logo' }, create: { key: 'logo', mimeType, data, sha256, updatedByUserId: actorId }, update: { mimeType, data, sha256, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.logo_changed', 'settings', 'logo', { mimeType, bytes: data.length }, undefined, tx);
    });
    this.platform.invalidate();
    return (await this.settings()).logo;
  }

  async removeLogo(actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.platformAsset.deleteMany({ where: { key: 'logo' } });
      await this.auditAdmin(actorId, 'platform.logo_removed', 'settings', 'logo', undefined, undefined, tx);
    });
    this.platform.invalidate();
  }

  // ------------------------------------------------------------------ e-mail templates

  private parse(key: string, locale: string): { key: MailTemplateKey; locale: MailTemplateLocale } {
    if (!isMailTemplateKey(key) || !(MAIL_LOCALES as readonly string[]).includes(locale)) throw new AppError('NOT_FOUND');
    return { key, locale: locale as MailTemplateLocale };
  }

  async listTemplates() {
    const rows = await this.prisma.emailTemplate.findMany();
    return MAIL_TEMPLATE_KEYS.flatMap((key) =>
      MAIL_LOCALES.map((locale) => {
        const row = rows.find((r) => r.templateKey === key && r.locale === locale);
        return { key, locale, customized: Boolean(row), subject: row?.subject ?? defaultMailText(key, locale).subject };
      }),
    );
  }

  async getTemplate(k: string, l: string) {
    const { key, locale } = this.parse(k, l);
    const row = await this.prisma.emailTemplate.findUnique({ where: { templateKey_locale: { templateKey: key, locale } } });
    const custom: MailTemplateText | null = row ? { subject: row.subject, body: row.body, action: row.actionLabel } : null;
    return { key, locale, placeholders: TEMPLATE_PLACEHOLDERS[key], hasButton: TEMPLATES_WITH_BUTTON.includes(key), default: defaultMailText(key, locale), custom };
  }

  private validated(key: MailTemplateKey, body: unknown): MailTemplateText {
    const r = validateTemplateText(key, body);
    if (!r.ok) throw new AppError('TEMPLATE_INVALID', { fields: r.errors });
    return r.value;
  }

  async saveTemplate(actorId: string, k: string, l: string, body: unknown) {
    const { key, locale } = this.parse(k, l);
    const text = this.validated(key, body);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.upsert({
        where: { templateKey_locale: { templateKey: key, locale } },
        create: { templateKey: key, locale, subject: text.subject, body: text.body, actionLabel: text.action, updatedByUserId: actorId },
        update: { subject: text.subject, body: text.body, actionLabel: text.action, updatedByUserId: actorId },
      });
      await this.auditAdmin(actorId, 'platform.email_template_changed', 'email_template', `${key}:${locale}`, { key, locale }, undefined, tx);
    });
    this.templates.invalidate();
    return this.getTemplate(key, locale);
  }

  async resetTemplate(actorId: string, k: string, l: string) {
    const { key, locale } = this.parse(k, l);
    await this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.deleteMany({ where: { templateKey: key, locale } });
      await this.auditAdmin(actorId, 'platform.email_template_reset', 'email_template', `${key}:${locale}`, { key, locale }, undefined, tx);
    });
    this.templates.invalidate();
    return this.getTemplate(key, locale);
  }

  private async renderDraft(key: MailTemplateKey, locale: MailTemplateLocale, draft: unknown) {
    const text = this.validated(key, draft);
    const [identity, brand, design] = await Promise.all([this.platform.identity(), this.platform.mailBrand(), this.designs.defaultTheme()]);
    const appName = identity.appName[locale];
    return { rendered: renderMail(key, locale, SAMPLE, { text, branding: { appName, footer: brand.footer[locale], accent: design.light.actionPrimary, accentText: design.light.actionPrimaryText } }), fromName: brand.fromName || appName };
  }

  async previewTemplate(k: string, l: string, draft: unknown) {
    const { key, locale } = this.parse(k, l);
    return (await this.renderDraft(key, locale, draft)).rendered;
  }

  /** Sends the (unsaved) draft with sample values to the administrator's own address. */
  async testSendTemplate(actorId: string, k: string, l: string, draft: unknown) {
    const { key, locale } = this.parse(k, l);
    const { rendered, fromName } = await this.renderDraft(key, locale, draft);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { email: true } });
    await this.mail.send({ to: me.email, ...rendered, subject: `[Test] ${rendered.subject}`, fromName });
    await this.auditAdmin(actorId, 'platform.email_template_tested', 'email_template', `${key}:${locale}`, { key, locale });
    return { sentTo: me.email };
  }
}
