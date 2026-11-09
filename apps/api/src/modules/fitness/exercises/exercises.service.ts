import { Inject, Injectable } from '@nestjs/common';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { CreateExerciseDto, ListExercisesQuery, UpdateExerciseDto } from './exercises.dto.js';

type I18n = { en?: string; ar?: string } | null;
interface Row {
  id: string; key: string | null; organizationId: string | null; nameI18n: unknown; muscleGroup: string; equipment: string;
  instructionsI18n: unknown; videoUrl: string | null; archivedAt: Date | null;
}

/**
 * FitExercise is a MIXED model (seeded system library with organization_id NULL + the organization's own), so this
 * is the one Fitness service that uses the unscoped client, with an explicit organization filter on every query.
 */
@Injectable()
export class ExercisesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private visible() {
    return { OR: [{ organizationId: requestContext.tenant().orgId }, { organizationId: null }] };
  }

  static toDto(e: Row) {
    const name = (e.nameI18n ?? {}) as { en: string; ar?: string };
    return {
      id: e.id, key: e.key, name: { en: name.en, ar: name.ar ?? null }, muscleGroup: e.muscleGroup, equipment: e.equipment,
      instructions: (e.instructionsI18n as I18n) ?? null, videoUrl: e.videoUrl, system: e.organizationId === null, archived: e.archivedAt !== null,
    };
  }

  async list(q: ListExercisesQuery) {
    const canSeeArchived = requestContext.tenant().grants['fitness.exercise.manage'] !== undefined;
    const rows = await this.prisma.fitExercise.findMany({
      where: {
        AND: [
          this.visible(),
          q.archived && canSeeArchived ? {} : { archivedAt: null },
          q.muscleGroup ? { muscleGroup: q.muscleGroup } : {},
          q.equipment ? { equipment: q.equipment } : {},
          q.q ? { OR: [{ nameI18n: { path: '$.en', string_contains: q.q } }, { nameI18n: { path: '$.ar', string_contains: q.q } }] } : {},
        ],
      },
      take: 500,
    });
    return rows.map((r) => ExercisesService.toDto(r)).sort((a, b) => a.name.en.localeCompare(b.name.en));
  }

  async get(id: string) {
    const e = await this.prisma.fitExercise.findFirst({ where: { id, ...this.visible() } });
    if (!e) throw new AppError('NOT_FOUND');
    return ExercisesService.toDto(e);
  }

  async create(dto: CreateExerciseDto) {
    const t = requestContext.tenant();
    const e = await this.prisma.fitExercise.create({
      data: {
        organizationId: t.orgId, scopeKey: t.orgId, nameI18n: { en: dto.name, ...(dto.nameAr ? { ar: dto.nameAr } : {}) },
        muscleGroup: dto.muscleGroup, equipment: dto.equipment, videoUrl: dto.videoUrl ?? null, createdByMembershipId: t.membershipId,
        instructionsI18n: dto.instructions || dto.instructionsAr ? { ...(dto.instructions ? { en: dto.instructions } : {}), ...(dto.instructionsAr ? { ar: dto.instructionsAr } : {}) } : undefined,
      },
    });
    return ExercisesService.toDto(e);
  }

  /** Only the organization's own exercises can change: system ones are 403, other organizations' ones do not exist. */
  private async requireOwn(id: string) {
    const e = await this.prisma.fitExercise.findFirst({ where: { id, ...this.visible() } });
    if (!e) throw new AppError('NOT_FOUND');
    if (e.organizationId === null) throw new AppError('FORBIDDEN');
    return e;
  }

  async update(id: string, dto: UpdateExerciseDto) {
    const e = await this.requireOwn(id);
    const name = { ...(e.nameI18n as { en: string; ar?: string }) };
    if (dto.name) name.en = dto.name;
    if (dto.nameAr) name.ar = dto.nameAr;
    const instructions = { ...((e.instructionsI18n as I18n) ?? {}) };
    if (dto.instructions !== undefined) instructions.en = dto.instructions || undefined;
    if (dto.instructionsAr !== undefined) instructions.ar = dto.instructionsAr || undefined;
    const updated = await this.prisma.fitExercise.update({
      where: { id },
      data: {
        nameI18n: name, muscleGroup: dto.muscleGroup, equipment: dto.equipment, videoUrl: dto.videoUrl,
        instructionsI18n: instructions.en || instructions.ar ? (JSON.parse(JSON.stringify(instructions)) as object) : undefined,
      },
    });
    return ExercisesService.toDto(updated);
  }

  async archive(id: string): Promise<void> {
    await this.requireOwn(id);
    await this.prisma.fitExercise.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  /** Which of these ids may be used in a plan now (visible and not archived). */
  async usableIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.fitExercise.findMany({ where: { id: { in: [...new Set(ids)] }, archivedAt: null, ...this.visible() }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }
}
