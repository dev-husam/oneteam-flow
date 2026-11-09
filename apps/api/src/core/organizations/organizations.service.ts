import { Inject, Injectable } from '@nestjs/common';
import { isValidSlug, navigationFor, roleLabelKey, slugify, visibleNavigation } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DesignService } from '../../infra/platform-config/design.service.js';
import { FeaturesService } from '../rbac/features.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { CreateOrganizationDto, UpdateOrganizationDto, toOrganizationDto } from './organization.dto.js';

/** True when a database error is the unique index that allows one live membership per account. */
export const isSingleOrganizationViolation = (err: unknown): boolean =>
  (err as { code?: string }).code === 'P2002' && JSON.stringify(err, Object.getOwnPropertyNames(err as object)).includes('active_user_key');

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
    @Inject(DesignService) private readonly designs: DesignService,
  ) {}

  /** Creates the organization, the owner membership and the category's default modules in one transaction. */
  async create(userId: string, emailVerified: boolean, dto: CreateOrganizationDto) {
    if (!emailVerified) throw new AppError('EMAIL_NOT_VERIFIED');
    await this.features.require('organization_creation');

    const category = await this.prisma.businessCategory.findUnique({ where: { key: dto.categoryKey } });
    if (!category || category.status !== 'ENABLED') throw new AppError('CATEGORY_UNAVAILABLE');

    // One organization per account: an owner, trainer or client who already belongs somewhere cannot start another.
    if (await this.prisma.membership.findFirst({ where: { userId, status: { not: 'REMOVED' } }, select: { id: true } })) {
      throw new AppError('ALREADY_IN_ORGANIZATION');
    }

    const generated = dto.slug === undefined;
    const base = dto.slug ?? slugify(dto.name);
    if (!isValidSlug(base)) throw new AppError('SLUG_INVALID');
    const slug = generated ? await this.availableSlug(base) : base;

    const ownerRole = await this.prisma.role.findUniqueOrThrow({ where: { scopeKey_key: { scopeKey: 'system', key: 'owner' } } });
    const defaultModules = await this.prisma.categoryModule.findMany({
      where: { categoryId: category.id, defaultEnabled: true, module: { status: 'ENABLED' } },
      select: { moduleId: true },
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: dto.name, slug, categoryId: category.id, description: dto.description,
            timezone: dto.timezone ?? 'UTC', defaultLocale: dto.defaultLocale ?? 'en', createdByUserId: userId,
            modules: { create: defaultModules.map((m) => ({ moduleId: m.moduleId })) },
          },
          include: { category: { select: { key: true } } },
        });
        const membership = await tx.membership.create({
          data: { organizationId: org.id, userId, roleId: ownerRole.id, activeUserKey: userId },
        });
        await this.audit.record(
          { action: 'organization.created', organizationId: org.id, targetType: 'organization', targetId: org.id, metadata: { slug, category: category.key } },
          tx,
        );
        return { organization: toOrganizationDto(org), membershipId: membership.id };
      });
    } catch (err) {
      if (isSingleOrganizationViolation(err)) throw new AppError('ALREADY_IN_ORGANIZATION');
      if ((err as { code?: string }).code === 'P2002') throw new AppError('SLUG_TAKEN');
      throw err;
    }
  }

  private async availableSlug(base: string): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? base : `${base.slice(0, 36)}-${i + 1}`;
      if (!(await this.prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
    }
    throw new AppError('SLUG_TAKEN');
  }

  /** Categories a new organization can choose from (enabled ones only). */
  async listEnabledCategories() {
    const rows = await this.prisma.businessCategory.findMany({ where: { status: 'ENABLED' }, orderBy: { sortOrder: 'asc' }, select: { key: true, nameI18n: true } });
    return rows.map((c) => ({ key: c.key, name: c.nameI18n as { en: string; ar: string } }));
  }

  /** All organizations the user belongs to (any status of the organization is shown so clients can explain it). */
  async listMine(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      include: { organization: { include: { category: { select: { key: true } } } }, role: { select: { id: true, key: true, name: true, rank: true } } },
    });
    return rows.map((m) => ({
      organization: toOrganizationDto(m.organization),
      membershipId: m.id,
      role: { id: m.role.id, key: m.role.key, name: m.role.name, rank: m.role.rank, labelKey: roleLabelKey(m.role.key, m.organization.category.key) },
    }));
  }

  /** Reads through the tenant-scoped client: Organization is scoped by its own id. */
  async getCurrent() {
    const org = await this.tenant.db.organization.findFirstOrThrow({ include: { category: { select: { key: true } } } });
    return toOrganizationDto(org);
  }

  async updateCurrent(dto: UpdateOrganizationDto) {
    const { orgId } = requestContext.tenant();
    const before = await this.tenant.db.organization.findFirstOrThrow({ include: { category: { select: { key: true } } } });
    const updated = await this.tenant.db.organization.update({
      where: { id: orgId },
      data: dto,
      include: { category: { select: { key: true } } },
    });
    await this.audit.record({
      action: 'organization.updated', targetType: 'organization', targetId: orgId,
      metadata: { fields: Object.keys(dto), previousName: before.name !== updated.name ? before.name : undefined },
    });
    return toOrganizationDto(updated);
  }

  /** What a client needs to render the organization shell: role, permissions, modules, permission-aware navigation. */
  async context() {
    const t = requestContext.tenant();
    const org = await this.getCurrent();
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id: t.roleId }, select: { id: true, key: true, name: true, rank: true } });
    const moduleRows = await this.tenant.db.organizationModule.findMany({
      where: { enabled: true, module: { status: 'ENABLED' } },
      include: { module: { select: { key: true } } },
    });
    const enabledModules = moduleRows.map((m) => m.module.key);
    const features = await this.features.mapFor(t.orgId);
    // Only set when this organization uses another design than the platform default (clients already have the default).
    const design = await this.designs.overrideFor(t.orgId);
    return {
      organization: org,
      membership: { id: t.membershipId, role: { ...role, labelKey: roleLabelKey(role.key, org.categoryKey) } },
      permissions: Object.entries(t.grants).map(([code, scope]) => ({ code, scope })),
      enabledModules,
      features,
      design,
      navigation: visibleNavigation(navigationFor(enabledModules), t.grants, enabledModules, features),
    };
  }
}
