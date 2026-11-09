import { Inject, Injectable } from '@nestjs/common';
import { deriveTaskStatus, scopeAllows } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage } from '../../common/pagination.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AuthorizationService } from '../../core/rbac/authorization.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AddAssigneesDto, CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './tasks.dto.js';

type Status = 'PENDING' | 'IN_PROGRESS' | 'DONE';
const MAX_ASSIGNEES = 200;

const taskInclude = {
  assignments: { include: { assignee: { include: { user: { select: { fullName: true } } } } }, orderBy: { id: 'asc' as const } },
  createdBy: { include: { user: { select: { fullName: true } } } },
  _count: { select: { comments: { where: { deletedAt: null } }, attachments: true } },
} as const;

type TaskRow = {
  id: string; typeKey: string; title: string; description: string | null; priority: string; status: string; dueAt: Date | null; completedAt: Date | null;
  version: number; createdAt: Date; createdByMembershipId: string;
  createdBy: { user: { fullName: string } };
  assignments: { id: string; assigneeMembershipId: string; status: string; completedAt: Date | null; sourceGroupId: string | null; assignee: { user: { fullName: string } } }[];
  _count: { comments: number; attachments: number };
};

@Injectable()
export class TasksService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ visibility

  /** Prisma filter for the tasks the caller may see under `task.read` (applied inside the query). */
  async visibleWhere() {
    const t = requestContext.tenant();
    const base = { deletedAt: null };
    switch (this.authz.grantFor('task.read')) {
      case 'ORG':
      case 'ALL':
        return base;
      case 'ASSIGNED': {
        const people = [t.membershipId, ...(await this.authz.assignedParticipantIds())];
        return { ...base, OR: [{ createdByMembershipId: t.membershipId }, { assignments: { some: { assigneeMembershipId: { in: people } } } }] };
      }
      case 'OWN':
        return { ...base, OR: [{ createdByMembershipId: t.membershipId }, { assignments: { some: { assigneeMembershipId: t.membershipId } } }] };
      default:
        return { ...base, id: { in: [] } };
    }
  }

  /** Loads a task the caller may see; anything else is a plain 404 (no existence leak). */
  async requireVisible(taskId: string): Promise<TaskRow> {
    const task = await this.tenant.db.task.findFirst({ where: { AND: [{ id: taskId }, await this.visibleWhere()] }, include: taskInclude });
    if (!task) throw new AppError('NOT_FOUND');
    return task as unknown as TaskRow;
  }

  private toDto(task: TaskRow) {
    const me = requestContext.tenant().membershipId;
    const mine = task.assignments.find((a) => a.assigneeMembershipId === me);
    return {
      id: task.id, typeKey: task.typeKey, title: task.title, description: task.description, priority: task.priority, status: task.status,
      dueAt: task.dueAt, completedAt: task.completedAt, version: task.version, createdAt: task.createdAt,
      createdByMembershipId: task.createdByMembershipId, createdByName: task.createdBy.user.fullName,
      myStatus: mine?.status ?? null,
      assignees: task.assignments.map((a) => ({ membershipId: a.assigneeMembershipId, fullName: a.assignee.user.fullName, status: a.status, completedAt: a.completedAt })),
      commentCount: task._count.comments, attachmentCount: task._count.attachments,
    };
  }

  // ------------------------------------------------------------------ create / assign

  /** Individuals plus the members of groups, each checked against the caller's `task.create` reach. */
  private async resolveAssignees(input: { assigneeMembershipIds?: string[]; groupIds?: string[] }): Promise<{ membershipId: string; sourceGroupId: string | null }[]> {
    const t = requestContext.tenant();
    const picked = new Map<string, string | null>();
    for (const id of input.assigneeMembershipIds ?? []) picked.set(id, null);

    if (input.groupIds?.length) {
      const groups = await this.tenant.db.group.findMany({
        where: { id: { in: [...new Set(input.groupIds)] }, archivedAt: null },
        include: { members: { where: { membership: { status: 'ACTIVE' } }, select: { membershipId: true } } },
      });
      if (groups.length !== new Set(input.groupIds).size) throw new AppError('NOT_FOUND');
      for (const g of groups) {
        if (!scopeAllows(t.grants['group.read'], { isOwn: g.createdByMembershipId === t.membershipId, isAssigned: false })) throw new AppError('NOT_FOUND');
        for (const m of g.members) if (!picked.has(m.membershipId)) picked.set(m.membershipId, g.id);
      }
    }
    if (picked.size === 0) picked.set(t.membershipId, null); // a task without assignees is a personal to-do
    if (picked.size > MAX_ASSIGNEES) throw new AppError('ASSIGNMENT_INVALID', { reason: 'too_many_assignees', max: MAX_ASSIGNEES });

    const members = await this.tenant.db.membership.findMany({ where: { id: { in: [...picked.keys()] }, status: 'ACTIVE' }, select: { id: true } });
    const active = new Set(members.map((m) => m.id));
    const assignedToMe = this.authz.grantFor('task.create') === 'ASSIGNED' ? new Set(await this.authz.assignedParticipantIds()) : new Set<string>();
    for (const id of picked.keys()) {
      const reach = this.authz.grantFor('task.create');
      const allowed = active.has(id) && scopeAllows(reach, { isOwn: id === t.membershipId, isAssigned: assignedToMe.has(id) });
      if (!allowed) throw new AppError('ASSIGNMENT_INVALID', { membershipId: id });
    }
    return [...picked].map(([membershipId, sourceGroupId]) => ({ membershipId, sourceGroupId }));
  }

  private async notifyAssigned(task: { id: string; title: string }, membershipIds: string[]) {
    const t = requestContext.tenant();
    const [org, actor, people] = await Promise.all([
      this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } }),
      this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
      this.tenant.db.membership.findMany({ where: { id: { in: membershipIds.filter((id) => id !== t.membershipId) } }, select: { userId: true } }),
    ]);
    await this.notifications.notify({
      userIds: people.map((p) => p.userId), organizationId: t.orgId, type: 'task.assigned',
      params: { actor: actor.user.fullName, title: task.title }, data: { orgSlug: org.slug, taskId: task.id },
    });
  }

  async create(dto: CreateTaskDto) {
    const t = requestContext.tenant();
    const assignees = await this.resolveAssignees(dto);
    const task = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: { organizationId: t.orgId, title: dto.title, description: dto.description, priority: dto.priority ?? 'MEDIUM', dueAt: dto.dueAt ? new Date(dto.dueAt) : null, createdByMembershipId: t.membershipId },
      });
      await tx.taskAssignment.createMany({
        data: assignees.map((a) => ({ organizationId: t.orgId, taskId: created.id, assigneeMembershipId: a.membershipId, sourceGroupId: a.sourceGroupId })),
      });
      await this.activity.record({ entityType: 'task', entityId: created.id, verb: 'task.created', data: { title: dto.title, assignees: assignees.length } }, tx);
      return created;
    });
    await this.notifyAssigned(task, assignees.map((a) => a.membershipId));
    return this.toDto(await this.requireVisible(task.id));
  }

  async addAssignees(taskId: string, dto: AddAssigneesDto) {
    const task = await this.requireManageable(taskId);
    const wanted = await this.resolveAssignees(dto);
    const existing = new Set(task.assignments.map((a) => a.assigneeMembershipId));
    const fresh = wanted.filter((a) => !existing.has(a.membershipId));
    if (task.assignments.length + fresh.length > MAX_ASSIGNEES) throw new AppError('ASSIGNMENT_INVALID', { reason: 'too_many_assignees' });
    if (fresh.length) {
      const orgId = requestContext.tenant().orgId;
      await this.tenant.db.$transaction(async (tx) => {
        await tx.taskAssignment.createMany({ data: fresh.map((a) => ({ organizationId: orgId, taskId, assigneeMembershipId: a.membershipId, sourceGroupId: a.sourceGroupId })) });
        await this.refreshStatus(tx, taskId, task.status);
        await this.activity.record({ entityType: 'task', entityId: taskId, verb: 'task.assigned', data: { count: fresh.length } }, tx);
      });
      await this.notifyAssigned(task, fresh.map((a) => a.membershipId));
    }
    return this.toDto(await this.requireVisible(taskId));
  }

  async removeAssignee(taskId: string, membershipId: string): Promise<void> {
    const task = await this.requireManageable(taskId);
    if (!task.assignments.some((a) => a.assigneeMembershipId === membershipId)) throw new AppError('NOT_FOUND');
    await this.tenant.db.$transaction(async (tx) => {
      await tx.taskAssignment.deleteMany({ where: { taskId, assigneeMembershipId: membershipId } });
      await this.refreshStatus(tx, taskId, task.status);
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: 'task.unassigned', subjectMembershipId: membershipId }, tx);
    });
  }

  // ------------------------------------------------------------------ read

  async list(q: ListTasksQuery) {
    const t = requestContext.tenant();
    const limit = pageSize(q);
    const assignee = q.assignee === 'me' ? t.membershipId : q.assignee;
    const rows = await this.tenant.db.task.findMany({
      where: {
        AND: [
          await this.visibleWhere(),
          cursorWhere(q.cursor, 'desc'),
          q.status ? { status: q.status } : {},
          q.priority ? { priority: q.priority } : {},
          assignee ? { assignments: { some: { assigneeMembershipId: assignee } } } : {},
          q.q ? { title: { contains: q.q } } : {},
          q.overdue ? { dueAt: { lt: new Date() }, status: { in: ['OPEN' as const, 'IN_PROGRESS' as const] } } : {},
        ],
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: taskInclude,
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((r) => this.toDto(r as unknown as TaskRow)), meta: page.meta };
  }

  async get(taskId: string) {
    const task = await this.requireVisible(taskId);
    const attachments = await this.tenant.db.taskAttachment.findMany({ where: { taskId }, include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true } } } });
    return { ...this.toDto(task), attachments: attachments.map((a) => ({ fileId: a.file.id, name: a.file.originalName, mimeType: a.file.mimeType, sizeBytes: Number(a.file.sizeBytes) })) };
  }

  history(taskId: string) {
    return this.requireVisible(taskId).then(() => this.activity.forEntity('task', taskId));
  }

  // ------------------------------------------------------------------ edit / status

  /** Visible AND editable under `task.manage` (own tasks or all). Visible-but-not-yours is 403. */
  private async requireManageable(taskId: string): Promise<TaskRow> {
    const task = await this.requireVisible(taskId);
    const t = requestContext.tenant();
    if (!scopeAllows(t.grants['task.manage'], { isOwn: task.createdByMembershipId === t.membershipId, isAssigned: false })) throw new AppError('FORBIDDEN');
    return task;
  }

  private async refreshStatus(tx: Pick<TenantPrismaService['db'], 'taskAssignment' | 'task'>, taskId: string, current: string): Promise<void> {
    if (current === 'CANCELLED') return;
    const rows = await tx.taskAssignment.findMany({ where: { taskId }, select: { status: true } });
    const status = deriveTaskStatus(rows.map((r) => r.status as Status));
    await tx.task.update({ where: { id: taskId }, data: { status, completedAt: status === 'DONE' ? new Date() : null } });
  }

  async update(taskId: string, dto: UpdateTaskDto) {
    const task = await this.requireManageable(taskId);
    const changed = Object.keys(dto).filter((k) => k !== 'version' && dto[k as keyof UpdateTaskDto] !== undefined);
    await this.tenant.db.$transaction(async (tx) => {
      // Compare-and-set on the version: two people editing at once cannot silently overwrite each other.
      const claimed = await tx.task.updateMany({
        where: { id: taskId, version: dto.version, deletedAt: null },
        data: {
          title: dto.title, description: dto.description, priority: dto.priority,
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt === null ? null : new Date(dto.dueAt) } : {}),
          ...(dto.status === 'CANCELLED' ? { status: 'CANCELLED' as const, completedAt: null } : {}),
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new AppError('CONFLICT', { reason: 'stale_version' });
      if (dto.status === 'OPEN') await this.refreshStatus(tx, taskId, 'OPEN');
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: dto.status === 'CANCELLED' ? 'task.cancelled' : dto.status === 'OPEN' ? 'task.reopened' : 'task.updated', data: { fields: changed } }, tx);
    });
    void task;
    return this.toDto(await this.requireVisible(taskId));
  }

  async remove(taskId: string): Promise<void> {
    await this.requireManageable(taskId);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: 'task.deleted' }, tx);
    });
    await this.audit.record({ action: 'task.deleted', targetType: 'task', targetId: taskId });
  }

  /** An assignee reports progress on their own part of the task. */
  async setMyStatus(taskId: string, status: Status) {
    const t = requestContext.tenant();
    const task = await this.requireVisible(taskId);
    const mine = task.assignments.find((a) => a.assigneeMembershipId === t.membershipId);
    if (!mine || !t.grants['task.update_status']) throw new AppError('FORBIDDEN');
    if (task.status === 'CANCELLED') throw new AppError('CONFLICT', { reason: 'task_cancelled' });

    await this.tenant.db.$transaction(async (tx) => {
      await tx.taskAssignment.update({ where: { id: mine.id }, data: { status, completedAt: status === 'DONE' ? new Date() : null } });
      await this.refreshStatus(tx, taskId, task.status);
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: `task.${status.toLowerCase()}`, subjectMembershipId: t.membershipId }, tx);
    });
    if (status === 'DONE' && mine.status !== 'DONE' && task.createdByMembershipId !== t.membershipId) {
      const [creator, actor, org] = await Promise.all([
        this.tenant.db.membership.findFirstOrThrow({ where: { id: task.createdByMembershipId }, select: { userId: true } }),
        this.tenant.db.membership.findFirstOrThrow({ where: { id: t.membershipId }, include: { user: { select: { fullName: true } } } }),
        this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } }),
      ]);
      await this.notifications.notify({ userIds: [creator.userId], organizationId: t.orgId, type: 'task.completed', params: { actor: actor.user.fullName, title: task.title }, data: { orgSlug: org.slug, taskId } });
    }
    return this.toDto(await this.requireVisible(taskId));
  }
}
