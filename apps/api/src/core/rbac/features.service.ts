import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { effectiveFeature, FEATURE_FLAGS, FEATURE_KEYS, type FeatureKey, type FeatureMap } from '@pt/domain';
import { AppError } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

interface Cached<T> {
  at: number;
  value: T;
}

/**
 * Feature flags: the platform value set by an administrator, optionally overridden for one organization.
 * Values are cached for `CONFIG_CACHE_SECONDS` (default 5) per process, so a change made in the admin console
 * reaches every instance within that time; the instance that handled the change refreshes immediately.
 */
@Injectable()
export class FeaturesService implements OnModuleInit {
  private platformCache: Cached<Map<string, boolean>> | null = null;
  private readonly orgCache = new Map<string, Cached<Map<string, boolean>>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** New flags enter the table with their default; a value an administrator set is never touched. */
  async onModuleInit(): Promise<void> {
    await this.prisma.featureFlag.createMany({ data: FEATURE_FLAGS.map((f) => ({ key: f.key, enabled: f.defaultEnabled })), skipDuplicates: true });
  }

  private get ttl(): number {
    return this.config.CONFIG_CACHE_SECONDS * 1000;
  }

  invalidate(orgId?: string): void {
    this.platformCache = null;
    if (orgId) this.orgCache.delete(orgId);
    else this.orgCache.clear();
  }

  private async platformValues(): Promise<Map<string, boolean>> {
    if (this.platformCache && Date.now() - this.platformCache.at < this.ttl) return this.platformCache.value;
    const rows = await this.prisma.featureFlag.findMany();
    const value = new Map(rows.map((r) => [r.key, r.enabled]));
    this.platformCache = { at: Date.now(), value };
    return value;
  }

  private async overrides(orgId: string): Promise<Map<string, boolean>> {
    const hit = this.orgCache.get(orgId);
    if (hit && Date.now() - hit.at < this.ttl) return hit.value;
    const rows = await this.prisma.organizationFeatureOverride.findMany({ where: { organizationId: orgId } });
    const value = new Map(rows.map((r) => [r.flagKey, r.enabled]));
    this.orgCache.set(orgId, { at: Date.now(), value });
    return value;
  }

  async isEnabled(key: FeatureKey, orgId?: string | null): Promise<boolean> {
    const platform = (await this.platformValues()).get(key) ?? FEATURE_FLAGS.find((f) => f.key === key)!.defaultEnabled;
    return effectiveFeature(key, platform, orgId ? (await this.overrides(orgId)).get(key) : undefined);
  }

  async require(key: FeatureKey, orgId?: string | null): Promise<void> {
    if (!(await this.isEnabled(key, orgId))) throw new AppError('FEATURE_DISABLED', { feature: key });
  }

  /** Every flag as the organization (or, without one, the platform) sees it. */
  async mapFor(orgId?: string | null): Promise<FeatureMap> {
    const platform = await this.platformValues();
    const overrides = orgId ? await this.overrides(orgId) : new Map<string, boolean>();
    return Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, effectiveFeature(k, platform.get(k) ?? FEATURE_FLAGS.find((f) => f.key === k)!.defaultEnabled, overrides.get(k))]),
    ) as FeatureMap;
  }
}
