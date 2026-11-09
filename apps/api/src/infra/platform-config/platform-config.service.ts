import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_IDENTITY, DEFAULT_MAIL_BRAND, validateIdentity, validateMailBrand, type IdentitySettings, type MailBrandSettings, type PublicConfig } from '@pt/domain';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { FeaturesService } from '../../core/rbac/features.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DesignService } from './design.service.js';

export type SettingKey = 'identity' | 'mail';

interface Cached<T> {
  at: number;
  value: T;
}
export interface LogoAsset {
  mimeType: string;
  data: Buffer;
  sha256: string;
  updatedAt: Date;
}

/**
 * Reads the settings an administrator manages (identity, theme, mail branding, logo). Stored documents are
 * validated again on read and fall back to the defaults, so a damaged row can never break a page.
 */
@Injectable()
export class PlatformConfigService {
  private settings: Cached<Map<string, unknown>> | null = null;
  private logo: Cached<LogoAsset | null> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FeaturesService) private readonly features: FeaturesService,
    @Inject(DesignService) private readonly designs: DesignService,
  ) {}

  private get ttl(): number {
    return this.config.CONFIG_CACHE_SECONDS * 1000;
  }

  invalidate(): void {
    this.settings = null;
    this.logo = null;
  }

  private async stored(key: SettingKey): Promise<unknown> {
    if (!this.settings || Date.now() - this.settings.at >= this.ttl) {
      const rows = await this.prisma.platformSetting.findMany();
      this.settings = { at: Date.now(), value: new Map(rows.map((r) => [r.key, r.value])) };
    }
    return this.settings.value.get(key);
  }

  async identity(): Promise<IdentitySettings> {
    const r = validateIdentity(await this.stored('identity'));
    return r.ok ? r.value : DEFAULT_IDENTITY;
  }
  async mailBrand(): Promise<MailBrandSettings> {
    const r = validateMailBrand(await this.stored('mail'));
    return r.ok ? r.value : DEFAULT_MAIL_BRAND;
  }

  async logoAsset(): Promise<LogoAsset | null> {
    if (!this.logo || Date.now() - this.logo.at >= this.ttl) {
      const row = await this.prisma.platformAsset.findUnique({ where: { key: 'logo' } });
      this.logo = { at: Date.now(), value: row ? { mimeType: row.mimeType, data: Buffer.from(row.data), sha256: row.sha256, updatedAt: row.updatedAt } : null };
    }
    return this.logo.value;
  }

  /** What any visitor may see: name, theme, logo address and whether sign-up and organization creation are open. */
  async publicConfig(): Promise<PublicConfig> {
    const [identity, design, logo, flags] = await Promise.all([this.identity(), this.designs.defaultTheme(), this.logoAsset(), this.features.mapFor(null)]);
    return {
      identity,
      design,
      // The hash changes with the image, so browsers and apps refetch exactly when the logo changed.
      logoUrl: logo ? `/config/logo?v=${logo.sha256.slice(0, 12)}` : null,
      features: { registration: flags.registration, organization_creation: flags.organization_creation },
    };
  }
}
