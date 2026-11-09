import { Inject, Injectable } from '@nestjs/common';
import { assessmentTrends, nextDueAt, validateAnswers, validateQuestions, type AssessmentAnswers, type AssessmentQuestion } from '@pt/domain';
import { requestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { CoachingReach, userName } from '../reach.service.js';
import type { ListAssessmentsQuery, RequestAssessmentDto, SubmitAssessmentDto, TemplateDto, UpdateTemplateDto } from './assessments.dto.js';

const include = { client: { select: userName }, requester: { select: userName } } as const;

const questionsOf = (json: unknown): AssessmentQuestion[] => {
  const r = validateQuestions(json);
  return r.ok ? r.value : [];
};

@Injectable()
export class AssessmentsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CoachingReach) private readonly reach: CoachingReach,
  ) {}

  // ------------------------------------------------------------------ templates (shared by the organization’s coaches)

  private templateDto(t: { id: string; name: string; description: string | null; questions: unknown; createdByMembershipId: string; archivedAt: Date | null; createdAt: Date; updatedAt: Date }) {
    return { id: t.id, name: t.name, description: t.description, questions: questionsOf(t.questions), createdByMembershipId: t.createdByMembershipId, archivedAt: t.archivedAt, createdAt: t.createdAt, updatedAt: t.updatedAt };
  }

  private checkedQuestions(input: unknown): AssessmentQuestion[] {
    const r = validateQuestions(input);
    if (!r.ok) throw new AppError('ASSESSMENT_INVALID', { issues: r.issues });
    return r.value;
  }

  async listTemplates(includeArchived = false) {
    const rows = await this.tenant.db.coachAssessmentTemplate.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((t) => this.templateDto(t));
  }

  async createTemplate(dto: TemplateDto) {
    const t = requestContext.tenant();
    const questions = this.checkedQuestions(dto.questions);
    const row = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.coachAssessmentTemplate.create({ data: { organizationId: t.orgId, name: dto.name.trim(), description: dto.description?.trim() || null, questions: questions as never, createdByMembershipId: t.membershipId } });
      await this.audit.record({ action: 'coaching.template_created', targetType: 'coach_assessment_template', targetId: created.id }, tx);
      return created;
    });
    return this.templateDto(row);
  }

  /** Coaches edit their own templates; owners (organization scope) edit any. Requests already sent keep the questions they were sent with. */
  private async editableTemplate(id: string) {
    const row = await this.tenant.db.coachAssessmentTemplate.findFirst({ where: { id } });
    if (!row || !(await this.authz.allows('coaching.assessment.manage', { ownerMembershipId: row.createdByMembershipId }))) throw new AppError('NOT_FOUND');
    return row;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    await this.editableTemplate(id);
    const row = await this.tenant.db.$transaction(async (tx) => {
      const updated = await tx.coachAssessmentTemplate.update({
        where: { id },
        data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}), ...(dto.questions !== undefined ? { questions: this.checkedQuestions(dto.questions) as never } : {}) },
      });
      await this.audit.record({ action: 'coaching.template_updated', targetType: 'coach_assessment_template', targetId: id }, tx);
      return updated;
    });
    return this.templateDto(row);
  }

  async archiveTemplate(id: string): Promise<void> {
    await this.editableTemplate(id);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.coachAssessmentTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record({ action: 'coaching.template_archived', targetType: 'coach_assessment_template', targetId: id }, tx);
    });
  }

  // ------------------------------------------------------------------ assessments asked of clients

  private dto(a: { id: string; templateId: string; clientMembershipId: string; requestedByMembershipId: string; title: string; questions: unknown; answers: unknown; status: string; cadenceDays: number | null; dueAt: Date | null; requestedAt: Date; completedAt: Date | null; client: { user: { fullName: string } }; requester: { user: { fullName: string } } }) {
    return {
      id: a.id, templateId: a.templateId, clientMembershipId: a.clientMembershipId, clientName: a.client.user.fullName, requestedByMembershipId: a.requestedByMembershipId, requestedByName: a.requester.user.fullName,
      title: a.title, questions: questionsOf(a.questions), answers: (a.answers ?? null) as AssessmentAnswers | null, status: a.status, cadenceDays: a.cadenceDays, dueAt: a.dueAt, requestedAt: a.requestedAt, completedAt: a.completedAt,
    };
  }

  async list(q: ListAssessmentsQuery) {
    const scope = await this.reach.clientFilter('coaching.assessment.read');
    const rows = await this.tenant.db.coachAssessment.findMany({
      where: {
        ...scope,
        ...(q.clientMembershipId ? { clientMembershipId: scope.clientMembershipId ? { in: scope.clientMembershipId.in.filter((i) => i === q.clientMembershipId) } : q.clientMembershipId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: [{ requestedAt: 'desc' }],
      take: 200,
      include,
    });
    return rows.map((a) => this.dto(a));
  }

  async get(id: string) {
    const a = await this.tenant.db.coachAssessment.findFirst({ where: { id }, include });
    if (!a || !(await this.authz.allows('coaching.assessment.read', { subjectMembershipId: a.clientMembershipId }))) throw new AppError('NOT_FOUND');
    return this.dto(a);
  }

  async request(dto: RequestAssessmentDto) {
    const t = requestContext.tenant();
    const client = await this.reach.requireClient('coaching.assessment.manage', dto.clientMembershipId);
    const template = await this.tenant.db.coachAssessmentTemplate.findFirst({ where: { id: dto.templateId, archivedAt: null } });
    if (!template) throw new AppError('NOT_FOUND');
    if (await this.tenant.db.coachAssessment.findFirst({ where: { templateId: template.id, clientMembershipId: client.id, status: 'REQUESTED' }, select: { id: true } })) throw new AppError('CONFLICT', { reason: 'already_requested' });
    const row = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.coachAssessment.create({
        data: { organizationId: t.orgId, templateId: template.id, clientMembershipId: client.id, requestedByMembershipId: t.membershipId, title: template.name, questions: template.questions as never, cadenceDays: dto.cadenceDays ?? null, dueAt: dto.dueAt ? new Date(dto.dueAt) : null },
        include,
      });
      await this.audit.record({ action: 'coaching.assessment_requested', targetType: 'coach_assessment', targetId: created.id, metadata: { clientMembershipId: client.id, cadenceDays: dto.cadenceDays ?? null } }, tx);
      return created;
    });
    await this.reach.notify([client.id], 'coaching.assessment_requested', { params: { title: row.title, name: row.requester.user.fullName }, audience: 'client' });
    return this.dto(row);
  }

  /** The client answers once; if the request repeats, the next one is created for after the cadence. */
  async submit(id: string, dto: SubmitAssessmentDto) {
    const t = requestContext.tenant();
    const a = await this.tenant.db.coachAssessment.findFirst({ where: { id, clientMembershipId: t.membershipId }, include });
    if (!a) throw new AppError('NOT_FOUND');
    if (a.status !== 'REQUESTED') throw new AppError('ASSESSMENT_NOT_OPEN');
    const questions = questionsOf(a.questions);
    const checked = validateAnswers(questions, dto.answers);
    if (!checked.ok) throw new AppError('ASSESSMENT_INVALID', { issues: checked.issues });
    const now = new Date();
    const done = await this.tenant.db.$transaction(async (tx) => {
      // The status check is part of the update, so two submissions at once cannot both succeed.
      const claimed = await tx.coachAssessment.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'COMPLETED', answers: checked.value as never, completedAt: now } });
      if (claimed.count !== 1) throw new AppError('ASSESSMENT_NOT_OPEN');
      if (a.cadenceDays) {
        await tx.coachAssessment.create({
          data: { organizationId: t.orgId, templateId: a.templateId, clientMembershipId: a.clientMembershipId, requestedByMembershipId: a.requestedByMembershipId, title: a.title, questions: a.questions as never, cadenceDays: a.cadenceDays, dueAt: nextDueAt(now, a.cadenceDays) },
        });
      }
      await this.audit.record({ action: 'coaching.assessment_submitted', targetType: 'coach_assessment', targetId: id, metadata: { repeats: Boolean(a.cadenceDays) } }, tx);
      return tx.coachAssessment.findFirstOrThrow({ where: { id }, include });
    });
    await this.reach.notify([a.requestedByMembershipId], 'coaching.assessment_completed', { params: { title: a.title, name: a.client.user.fullName }, clientId: a.clientMembershipId, audience: 'coach' });
    return this.dto(done);
  }

  /** Cancelling an open request also stops it from repeating. */
  async cancel(id: string) {
    const a = await this.tenant.db.coachAssessment.findFirst({ where: { id }, include });
    if (!a || !(await this.authz.allows('coaching.assessment.manage', { subjectMembershipId: a.clientMembershipId }))) throw new AppError('NOT_FOUND');
    if (a.status !== 'REQUESTED') throw new AppError('ASSESSMENT_NOT_OPEN');
    const row = await this.tenant.db.$transaction(async (tx) => {
      const updated = await tx.coachAssessment.update({ where: { id }, data: { status: 'CANCELLED' }, include });
      await this.audit.record({ action: 'coaching.assessment_cancelled', targetType: 'coach_assessment', targetId: id }, tx);
      return updated;
    });
    return this.dto(row);
  }

  async trends(clientMembershipId: string) {
    if (!(await this.authz.allows('coaching.assessment.read', { subjectMembershipId: clientMembershipId }))) throw new AppError('NOT_FOUND');
    const rows = await this.tenant.db.coachAssessment.findMany({ where: { clientMembershipId, status: 'COMPLETED' }, orderBy: { completedAt: 'asc' }, take: 500 });
    return assessmentTrends(rows.map((r) => ({ id: r.id, completedAt: r.completedAt!, questions: questionsOf(r.questions), answers: (r.answers ?? {}) as AssessmentAnswers })));
  }
}
