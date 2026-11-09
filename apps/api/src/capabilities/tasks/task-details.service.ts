import { Inject, Injectable } from '@nestjs/common';
import { scopeAllows } from '@pt/domain';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { cursorWhere, pageSize, toPage, type PageQueryDto } from '../../common/pagination.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from './tasks.service.js';

/** Comments and attachments of a task. Everything starts from "may the caller see this task?". */
@Injectable()
export class TaskDetailsService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(ActivityService) private readonly activity: ActivityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private toComment(c: { id: string; authorMembershipId: string; body: string; editedAt: Date | null; createdAt: Date; author: { user: { fullName: string } } }) {
    return { id: c.id, authorMembershipId: c.authorMembershipId, authorName: c.author.user.fullName, body: c.body, edited: c.editedAt !== null, createdAt: c.createdAt };
  }

  async listComments(taskId: string, q: PageQueryDto) {
    await this.tasks.requireVisible(taskId);
    const limit = pageSize(q);
    const rows = await this.tenant.db.taskComment.findMany({
      where: { taskId, deletedAt: null, ...cursorWhere(q.cursor, 'asc') },
      orderBy: { id: 'asc' }, take: limit + 1,
      include: { author: { include: { user: { select: { fullName: true } } } } },
    });
    const page = toPage(rows, limit);
    return { data: page.data.map((c) => this.toComment(c)), meta: page.meta };
  }

  async addComment(taskId: string, body: string) {
    const t = requestContext.tenant();
    if (!t.grants['task.comment']) throw new AppError('FORBIDDEN');
    const task = await this.tasks.requireVisible(taskId);
    const comment = await this.tenant.db.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: { organizationId: t.orgId, taskId, authorMembershipId: t.membershipId, body },
        include: { author: { include: { user: { select: { fullName: true } } } } },
      });
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: 'task.commented' }, tx);
      return created;
    });
    // Tell the creator and every assignee (not the author).
    const recipients = [task.createdByMembershipId, ...task.assignments.map((a) => a.assigneeMembershipId)].filter((id) => id !== t.membershipId);
    const [people, org] = await Promise.all([
      this.tenant.db.membership.findMany({ where: { id: { in: [...new Set(recipients)] }, status: 'ACTIVE' }, select: { userId: true } }),
      this.tenant.db.organization.findFirstOrThrow({ select: { slug: true } }),
    ]);
    await this.notifications.notify({ userIds: people.map((p) => p.userId), organizationId: t.orgId, type: 'task.comment', params: { actor: comment.author.user.fullName, title: task.title }, data: { orgSlug: org.slug, taskId } });
    return this.toComment(comment);
  }

  /** Authors edit their own comments; only authors can. */
  async editComment(taskId: string, commentId: string, body: string) {
    await this.tasks.requireVisible(taskId);
    const t = requestContext.tenant();
    const existing = await this.tenant.db.taskComment.findFirst({ where: { id: commentId, taskId, deletedAt: null } });
    if (!existing) throw new AppError('NOT_FOUND');
    if (existing.authorMembershipId !== t.membershipId) throw new AppError('FORBIDDEN');
    const updated = await this.tenant.db.taskComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() }, include: { author: { include: { user: { select: { fullName: true } } } } } });
    return this.toComment(updated);
  }

  /** Authors delete their own; people who manage all tasks can moderate. */
  async deleteComment(taskId: string, commentId: string): Promise<void> {
    await this.tasks.requireVisible(taskId);
    const t = requestContext.tenant();
    const existing = await this.tenant.db.taskComment.findFirst({ where: { id: commentId, taskId, deletedAt: null } });
    if (!existing) throw new AppError('NOT_FOUND');
    const moderator = scopeAllows(t.grants['task.manage'], { isOwn: false, isAssigned: false });
    if (existing.authorMembershipId !== t.membershipId && !moderator) throw new AppError('FORBIDDEN');
    await this.tenant.db.taskComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  }

  /** Only the uploader can attach their own, finished upload (a file id alone grants nothing). */
  async attach(taskId: string, fileId: string): Promise<void> {
    await this.tasks.requireVisible(taskId);
    const t = requestContext.tenant();
    const file = await this.tenant.db.file.findFirst({ where: { id: fileId, uploaderMembershipId: t.membershipId, status: 'READY', deletedAt: null } });
    if (!file) throw new AppError('NOT_FOUND');
    const exists = await this.tenant.db.taskAttachment.findFirst({ where: { taskId, fileId } });
    if (exists) return;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.taskAttachment.create({ data: { organizationId: t.orgId, taskId, fileId } });
      await this.activity.record({ entityType: 'task', entityId: taskId, verb: 'task.file_attached', data: { name: file.originalName } }, tx);
    });
  }

  async detach(taskId: string, fileId: string): Promise<void> {
    await this.tasks.requireVisible(taskId);
    const t = requestContext.tenant();
    const link = await this.tenant.db.taskAttachment.findFirst({ where: { taskId, fileId }, include: { file: { select: { uploaderMembershipId: true } } } });
    if (!link) throw new AppError('NOT_FOUND');
    const moderator = scopeAllows(t.grants['task.manage'], { isOwn: false, isAssigned: false });
    if (link.file.uploaderMembershipId !== t.membershipId && !moderator) throw new AppError('FORBIDDEN');
    await this.tenant.db.taskAttachment.deleteMany({ where: { taskId, fileId } });
  }
}
