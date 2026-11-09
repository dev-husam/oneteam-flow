import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QUEUES, type EmailJob } from '../queue/queues.js';
import { MailService } from './mail.service.js';
import { renderNotification } from '../../capabilities/notifications/notification-text.js';
import { DesignService } from '../platform-config/design.service.js';
import { MailTemplatesService } from '../platform-config/mail-templates.service.js';
import { PlatformConfigService } from '../platform-config/platform-config.service.js';
import { renderMail, type MailLocale, type MailTemplate, type Vars } from './mail-templates.js';

@Processor(QUEUES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PlatformConfigService) private readonly platform: PlatformConfigService,
    @Inject(MailTemplatesService) private readonly templates: MailTemplatesService,
    @Inject(DesignService) private readonly designs: DesignService,
  ) {
    super();
  }

  /** Renders with the administrator's wording and branding (app name, footer, accent) and sends with the configured sender name. */
  private async deliver(to: string, template: MailTemplate, locale: MailLocale, vars: Vars): Promise<void> {
    const [identity, brand, design, text] = await Promise.all([this.platform.identity(), this.platform.mailBrand(), this.designs.defaultTheme(), this.templates.override(template, locale)]);
    const appName = identity.appName[locale];
    const rendered = renderMail(template, locale, vars, { text, branding: { appName, footer: brand.footer[locale], accent: design.light.actionPrimary, accentText: design.light.actionPrimaryText } });
    await this.mail.send({ to, ...rendered, fromName: brand.fromName || appName });
  }

  async process(job: Job<EmailJob>): Promise<void> {
    const data = job.data;
    if (data.template === 'invitation') return this.sendInvitation(data.invitationId, data.token);
    if (data.template === 'notification') return this.sendNotification(data);
    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      this.logger.warn({ userId: data.userId }, 'Skipping e-mail: user no longer exists');
      return;
    }
    const locale: MailLocale = user.locale === 'ar' ? 'ar' : 'en';
    const base = `${this.config.WEB_BASE_URL}/${locale}`;
    const link =
      data.template === 'verify-email'
        ? `${base}/verify-email?token=${encodeURIComponent(data.token)}`
        : data.template === 'reset-password'
          ? `${base}/reset-password?token=${encodeURIComponent(data.token)}`
          : undefined;
    await this.deliver(user.email, data.template, locale, { name: user.fullName, link });
  }

  private async sendNotification(data: Extract<EmailJob, { template: 'notification' }>): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) return;
    const locale: MailLocale = user.locale === 'ar' ? 'ar' : 'en';
    const { title, body } = renderNotification(data.type, locale, data.params);
    const slug = data.data?.orgSlug;
    const path = slug ? `/${locale}/o/${slug}${data.data?.taskId ? `/tasks/${data.data.taskId}` : ''}` : `/${locale}/dashboard`;
    await this.deliver(user.email, 'notification', locale, { name: user.fullName, title, body, link: `${this.config.WEB_BASE_URL}${path}` });
  }

  /** The recipient may not have an account yet, so the address and context come from the invitation itself. */
  private async sendInvitation(invitationId: string, token: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { organization: { select: { name: true, defaultLocale: true } }, invitedBy: { include: { user: { select: { fullName: true } } } } },
    });
    if (!invitation || invitation.status !== 'PENDING') return; // revoked or accepted meanwhile
    const locale: MailLocale = invitation.organization.defaultLocale === 'ar' ? 'ar' : 'en';
    const payload = (invitation.payload ?? {}) as { fullName?: string };
    const link = `${this.config.WEB_BASE_URL}/${locale}/invitations/accept?token=${encodeURIComponent(token)}`;
    await this.deliver(invitation.email, 'invitation', locale, {
      name: payload.fullName ?? invitation.email,
      orgName: invitation.organization.name,
      inviterName: invitation.invitedBy.user.fullName,
      link,
    });
  }
}
