import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ALL_PERMISSIONS, MODULE_MANIFESTS, SEED_EXERCISES, SYSTEM_ROLE_TEMPLATES } from '@pt/domain';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { GrantScope } from '../../generated/prisma/client.js';

const CATEGORIES = [
  { key: 'fitness', en: 'Fitness', ar: 'اللياقة البدنية', status: 'ENABLED', sortOrder: 1 },
  { key: 'education', en: 'Education', ar: 'التعليم', status: 'DISABLED', sortOrder: 2 },
  { key: 'coaching', en: 'Coaching', ar: 'التدريب والتوجيه', status: 'DISABLED', sortOrder: 3 },
  { key: 'business', en: 'Business', ar: 'الأعمال', status: 'DISABLED', sortOrder: 4 },
] as const;

const MODULES = [
  { key: 'fitness', en: 'Fitness', ar: 'اللياقة البدنية', status: 'ENABLED', categories: ['fitness'] },
  { key: 'coaching', en: 'Coaching', ar: 'التدريب والتوجيه', status: 'ENABLED', categories: ['coaching'] },
] as const;

/**
 * Idempotent boot-time sync of the code-defined catalog into the database:
 *  - permissions and system roles are authoritative in code (overwritten),
 *  - categories and modules are only created when missing (a super admin's enable/disable choice is kept).
 */
@Injectable()
export class CatalogSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  async sync(): Promise<void> {
    await this.syncPermissions();
    await this.syncSystemRoles();
    await this.syncCatalog();
    await this.syncModuleContent();
    this.logger.log('Permission and role catalog synchronized');
  }

  private async syncPermissions(): Promise<void> {
    for (const def of ALL_PERMISSIONS) {
      const data = {
        scopeType: def.scopeType,
        groupKey: def.group,
        moduleKey: def.moduleKey ?? null,
        description: def.description,
        allowedScopes: [...def.allowedScopes],
      };
      await this.prisma.permission.upsert({ where: { code: def.code }, create: { code: def.code, ...data }, update: data });
    }
  }

  private async syncSystemRoles(): Promise<void> {
    const permissions = await this.prisma.permission.findMany({ select: { id: true, code: true } });
    const idByCode = new Map(permissions.map((p) => [p.code, p.id]));

    for (const tpl of SYSTEM_ROLE_TEMPLATES) {
      const scopeKey = tpl.scopeType === 'PLATFORM' ? 'platform' : 'system';
      const role = await this.prisma.role.upsert({
        where: { scopeKey_key: { scopeKey, key: tpl.key } },
        create: { scopeKey, key: tpl.key, name: tpl.key, scopeType: tpl.scopeType, rank: tpl.rank, isSystem: true },
        update: { rank: tpl.rank, scopeType: tpl.scopeType, isSystem: true },
      });

      const existing = await this.prisma.rolePermission.findMany({ where: { roleId: role.id } });
      const desired = new Map(Object.entries(tpl.grants).map(([code, scope]) => [idByCode.get(code)!, scope as GrantScope]));

      const stale = existing.filter((e) => !desired.has(e.permissionId)).map((e) => e.permissionId);
      if (stale.length) await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: stale } } });
      for (const [permissionId, grantScope] of desired) {
        const current = existing.find((e) => e.permissionId === permissionId);
        if (!current) await this.prisma.rolePermission.create({ data: { roleId: role.id, permissionId, grantScope } });
        else if (current.grantScope !== grantScope) {
          await this.prisma.rolePermission.update({ where: { roleId_permissionId: { roleId: role.id, permissionId } }, data: { grantScope } });
        }
      }
    }
  }

  private async syncCatalog(): Promise<void> {
    for (const c of CATEGORIES) {
      await this.prisma.businessCategory.upsert({
        where: { key: c.key },
        create: { key: c.key, nameI18n: { en: c.en, ar: c.ar }, status: c.status, sortOrder: c.sortOrder },
        update: { nameI18n: { en: c.en, ar: c.ar }, sortOrder: c.sortOrder },
      });
    }
    for (const m of MODULES) {
      const mod = await this.prisma.platformModule.upsert({
        where: { key: m.key },
        create: { key: m.key, nameI18n: { en: m.en, ar: m.ar }, status: m.status },
        update: { nameI18n: { en: m.en, ar: m.ar } },
      });
      for (const categoryKey of m.categories) {
        const category = await this.prisma.businessCategory.findUniqueOrThrow({ where: { key: categoryKey } });
        await this.prisma.categoryModule.upsert({
          where: { categoryId_moduleId: { categoryId: category.id, moduleId: mod.id } },
          create: { categoryId: category.id, moduleId: mod.id, defaultEnabled: true },
          update: {},
        });
      }
    }
  }

  /**
   * System-wide content registered by module manifests: their measurements and (for Fitness) the seeded exercise
   * library. Upserted by stable key, so re-running never duplicates; edits to seeded rows are overwritten.
   */
  private async syncModuleContent(): Promise<void> {
    for (const mod of MODULE_MANIFESTS) {
      for (const m of mod.metrics) {
        const data = { name: m.names.en, unit: m.unit, precision: m.precision, higherIsBetter: m.higherIsBetter, moduleKey: mod.key };
        await this.prisma.metricDefinition.upsert({
          where: { scopeKey_key: { scopeKey: 'system', key: m.key } },
          create: { scopeKey: 'system', key: m.key, ...data },
          update: data,
        });
      }
    }
    for (const e of SEED_EXERCISES) {
      const data = { nameI18n: { en: e.en, ar: e.ar }, muscleGroup: e.muscleGroup, equipment: e.equipment };
      await this.prisma.fitExercise.upsert({
        where: { scopeKey_key: { scopeKey: 'system', key: e.key } },
        create: { scopeKey: 'system', key: e.key, ...data },
        update: data,
      });
    }
  }
}
