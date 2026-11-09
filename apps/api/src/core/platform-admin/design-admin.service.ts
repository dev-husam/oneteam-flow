import { Inject, Injectable } from '@nestjs/common';
import { builtInDesign, mergeDesign, slugifyDesignKey, validateDesign, type DesignDefinition, type DesignTheme } from '@pt/domain';
import { AppError } from '../../common/errors/app-error.js';
import { DesignService, definitionOf } from '../../infra/platform-config/design.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

type Patch = Parameters<typeof mergeDesign>[1] & { userSelectable?: boolean };

/**
 * Everything an administrator does with designs: create (optionally from an existing one), edit, reset a built-in one,
 * delete a custom one, choose the platform default, and give one organization another design. Every definition goes
 * through the shared validator, so a theme with unreadable text can never be saved. All writes are audited.
 */
@Injectable()
export class DesignAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DesignService) private readonly designs: DesignService,
  ) {}

  private auditAdmin(actorUserId: string, action: string, targetId: string, metadata?: Record<string, unknown>, orgId?: string, tx?: unknown) {
    return this.audit.record({ action, actorUserId, actorType: 'SUPER_ADMIN', organizationId: orgId ?? null, targetType: 'design', targetId, metadata }, tx);
  }

  private checked(input: unknown): { value: DesignDefinition; warnings: unknown[] } {
    const r = validateDesign(input);
    if (!r.ok) throw new AppError('DESIGN_INVALID', { issues: r.issues, warnings: r.warnings });
    return { value: r.value, warnings: r.warnings };
  }

  private async dto(theme: DesignTheme, builtInKey: string | null, extra: { isDefault: boolean; organizationCount: number; userSelectable: boolean; userCount: number; updatedAt: Date }, warnings: unknown[] = []) {
    return { ...theme, builtIn: builtInKey !== null, isDefault: extra.isDefault, organizationCount: extra.organizationCount, userSelectable: extra.userSelectable, userCount: extra.userCount, updatedAt: extra.updatedAt, warnings };
  }

  async list() {
    const [themes, defaultKey, counts, people] = await Promise.all([this.designs.themes(), this.designs.defaultKey(), this.prisma.organizationDesign.groupBy({ by: ['themeKey'], _count: { _all: true } }), this.prisma.user.groupBy({ by: ['designKey'], _count: { _all: true }, where: { designKey: { not: null } } })]);
    const used = new Map(counts.map((c) => [c.themeKey, c._count._all]));
    const chosen = new Map(people.map((c) => [c.designKey, c._count._all]));
    return Promise.all([...themes.values()].map((s) => this.dto(s.theme, s.builtInKey, { isDefault: s.theme.key === defaultKey, organizationCount: used.get(s.theme.key) ?? 0, userSelectable: s.userSelectable, userCount: chosen.get(s.theme.key) ?? 0, updatedAt: s.updatedAt })));
  }

  private async stored(key: string) {
    this.designs.invalidate();
    const s = (await this.designs.themes()).get(key);
    if (!s) throw new AppError('NOT_FOUND');
    return s;
  }

  async get(key: string) {
    const s = await this.stored(key);
    const [defaultKey, count, chosen] = await Promise.all([this.designs.defaultKey(), this.prisma.organizationDesign.count({ where: { themeKey: key } }), this.prisma.user.count({ where: { designKey: key } })]);
    const warnings = validateDesign(s.theme).warnings;
    return this.dto(s.theme, s.builtInKey, { isDefault: key === defaultKey, organizationCount: count, userSelectable: s.userSelectable, userCount: chosen, updatedAt: s.updatedAt }, warnings);
  }

  /** `basedOn` copies an existing design (the default when omitted); the patch then changes what the administrator named. */
  async create(actorId: string, body: Patch & { basedOn?: string }) {
    const base = body.basedOn ? await this.designs.get(body.basedOn) : await this.designs.defaultTheme();
    if (!base) throw new AppError('NOT_FOUND');
    const { value, warnings } = this.checked(mergeDesign(base, { ...body, name: body.name ?? `${base.name} copy` }));
    const themes = await this.designs.themes();
    let key = slugifyDesignKey(value.name);
    for (let i = 2; themes.has(key); i += 1) key = `${slugifyDesignKey(value.name).slice(0, 36)}-${i}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.designTheme.create({ data: { key, name: value.name, description: value.description, definition: definitionOf(value) as never, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.design_created', key, { basedOn: base.key, name: value.name }, undefined, tx);
    });
    this.designs.invalidate();
    return { ...(await this.get(key)), warnings };
  }

  async update(actorId: string, key: string, patch: Patch) {
    const current = await this.stored(key);
    const { value, warnings } = this.checked(mergeDesign(current.theme, patch));
    if (patch.userSelectable !== undefined && typeof patch.userSelectable !== 'boolean') throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'userSelectable', rules: ['isBoolean'] }] });
    await this.prisma.$transaction(async (tx) => {
      await tx.designTheme.update({ where: { key }, data: { name: value.name, description: value.description, definition: definitionOf(value) as never, ...(patch.userSelectable !== undefined ? { userSelectable: patch.userSelectable } : {}), updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.design_updated', key, { fields: Object.keys(patch), tokens: [...Object.keys(patch.light ?? {}), ...Object.keys(patch.dark ?? {})].length }, undefined, tx);
    });
    this.designs.invalidate();
    return { ...(await this.get(key)), warnings };
  }

  /** Built-in designs return to the original values shipped with the platform. */
  async reset(actorId: string, key: string) {
    const current = await this.stored(key);
    const original = current.builtInKey ? builtInDesign(current.builtInKey) : undefined;
    if (!original) throw new AppError('VALIDATION_FAILED', { fields: [{ field: 'key', rules: ['builtInOnly'] }] });
    await this.prisma.$transaction(async (tx) => {
      await tx.designTheme.update({ where: { key }, data: { name: original.name, description: original.description, definition: definitionOf(original) as never, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.design_reset', key, undefined, undefined, tx);
    });
    this.designs.invalidate();
    return this.get(key);
  }

  async remove(actorId: string, key: string): Promise<void> {
    const s = await this.stored(key);
    if (s.builtInKey) throw new AppError('DESIGN_BUILT_IN');
    const [defaultKey, used] = await Promise.all([this.designs.defaultKey(), this.prisma.organizationDesign.count({ where: { themeKey: key } })]);
    if (key === defaultKey || used > 0) throw new AppError('DESIGN_IN_USE', { default: key === defaultKey, organizations: used });
    await this.prisma.$transaction(async (tx) => {
      await tx.designTheme.delete({ where: { key } });
      await this.auditAdmin(actorId, 'platform.design_deleted', key, { name: s.theme.name }, undefined, tx);
    });
    this.designs.invalidate();
  }

  async setDefault(actorId: string, key: string) {
    await this.stored(key);
    const before = await this.designs.defaultKey();
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({ where: { key: 'design' }, create: { key: 'design', value: { defaultKey: key }, updatedByUserId: actorId }, update: { value: { defaultKey: key }, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.design_default_changed', key, { from: before, to: key }, undefined, tx);
    });
    this.designs.invalidate();
    return this.list();
  }

  private async requireOrganization(organizationId: string) {
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new AppError('NOT_FOUND');
  }

  async organizationDesign(organizationId: string) {
    await this.requireOrganization(organizationId);
    const row = await this.prisma.organizationDesign.findUnique({ where: { organizationId } });
    return { themeKey: row?.themeKey ?? null, default: await this.designs.defaultKey() };
  }

  /** `key: null` returns the organization to the platform default. */
  async setOrganizationDesign(actorId: string, organizationId: string, key: string | null) {
    await this.requireOrganization(organizationId);
    if (key !== null) await this.stored(key);
    const before = await this.prisma.organizationDesign.findUnique({ where: { organizationId }, select: { themeKey: true } });
    await this.prisma.$transaction(async (tx) => {
      if (key === null) await tx.organizationDesign.deleteMany({ where: { organizationId } });
      else await tx.organizationDesign.upsert({ where: { organizationId }, create: { organizationId, themeKey: key, updatedByUserId: actorId }, update: { themeKey: key, updatedByUserId: actorId } });
      await this.auditAdmin(actorId, 'platform.design_organization_changed', organizationId, { from: before?.themeKey ?? null, to: key }, organizationId, tx);
    });
    this.designs.invalidate();
    return this.organizationDesign(organizationId);
  }
}
