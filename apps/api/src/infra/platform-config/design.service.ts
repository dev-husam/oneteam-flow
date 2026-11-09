import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BUILT_IN_DESIGNS, builtInDesign, DEFAULT_DESIGN_KEY, FALLBACK_DESIGN, parseDesignTheme, type DesignTheme } from '@pt/domain';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface StoredDesign {
  theme: DesignTheme;
  builtInKey: string | null;
  /** Offered to people as a personal choice. */
  userSelectable: boolean;
  updatedAt: Date;
}

interface Cached<T> {
  at: number;
  value: T;
}

/** The definition column holds everything except the key, name and description (which have their own columns). */
export const definitionOf = (t: Pick<DesignTheme, 'radius' | 'font' | 'light' | 'dark'>) => ({ radius: t.radius, font: t.font, light: t.light, dark: t.dark });

/**
 * Designs: built-in ones are created at boot from @pt/domain (never overwritten once an administrator edited them);
 * the platform has one default, and an organization may use another. Rows are validated again on read: a damaged
 * custom design is skipped, a damaged built-in one falls back to its original.
 */
@Injectable()
export class DesignService implements OnModuleInit {
  private all: Cached<Map<string, StoredDesign>> | null = null;
  private defaultCache: Cached<string> | null = null;
  private readonly orgCache = new Map<string, Cached<string | null>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.designTheme.createMany({
      data: BUILT_IN_DESIGNS.map((d) => ({ key: d.key, name: d.name, description: d.description, builtInKey: d.key, userSelectable: true, definition: definitionOf(d) as never })),
      skipDuplicates: true,
    });
  }

  private get ttl(): number {
    return this.config.CONFIG_CACHE_SECONDS * 1000;
  }

  invalidate(): void {
    this.all = null;
    this.defaultCache = null;
    this.orgCache.clear();
  }

  async themes(): Promise<Map<string, StoredDesign>> {
    if (this.all && Date.now() - this.all.at < this.ttl) return this.all.value;
    const rows = await this.prisma.designTheme.findMany({ orderBy: { createdAt: 'asc' } });
    const value = new Map<string, StoredDesign>();
    for (const r of rows) {
      const def = (r.definition ?? {}) as Record<string, unknown>;
      let theme = parseDesignTheme({ key: r.key, name: r.name, description: r.description, ...def });
      if (!theme && r.builtInKey) theme = builtInDesign(r.builtInKey) ?? null;
      if (theme) value.set(r.key, { theme, builtInKey: r.builtInKey, userSelectable: r.userSelectable, updatedAt: r.updatedAt });
    }
    this.all = { at: Date.now(), value };
    return value;
  }

  async get(key: string): Promise<DesignTheme | null> {
    return (await this.themes()).get(key)?.theme ?? null;
  }

  async defaultKey(): Promise<string> {
    if (!this.defaultCache || Date.now() - this.defaultCache.at >= this.ttl) {
      const row = await this.prisma.platformSetting.findUnique({ where: { key: 'design' } });
      const key = (row?.value as { defaultKey?: unknown } | null)?.defaultKey;
      this.defaultCache = { at: Date.now(), value: typeof key === 'string' && (await this.themes()).has(key) ? key : DEFAULT_DESIGN_KEY };
    }
    return this.defaultCache.value;
  }

  async defaultTheme(): Promise<DesignTheme> {
    return (await this.get(await this.defaultKey())) ?? FALLBACK_DESIGN;
  }

  /** The design an organization uses instead of the default; null when it follows the default. */
  async overrideFor(orgId: string): Promise<DesignTheme | null> {
    let hit = this.orgCache.get(orgId);
    if (!hit || Date.now() - hit.at >= this.ttl) {
      const row = await this.prisma.organizationDesign.findUnique({ where: { organizationId: orgId }, select: { themeKey: true } });
      hit = { at: Date.now(), value: row?.themeKey ?? null };
      this.orgCache.set(orgId, hit);
    }
    return hit.value ? await this.get(hit.value) : null;
  }
}
