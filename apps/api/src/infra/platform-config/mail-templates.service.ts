import { Inject, Injectable } from '@nestjs/common';
import { validateTemplateText, type MailTemplateKey, type MailTemplateLocale, type MailTemplateText } from '@pt/domain';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The administrator's wording for e-mail templates; absent or invalid rows mean "use the built-in text". */
@Injectable()
export class MailTemplatesService {
  private cache: { at: number; rows: Map<string, MailTemplateText> } | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async rows(): Promise<Map<string, MailTemplateText>> {
    if (this.cache && Date.now() - this.cache.at < this.config.CONFIG_CACHE_SECONDS * 1000) return this.cache.rows;
    const all = await this.prisma.emailTemplate.findMany();
    const rows = new Map<string, MailTemplateText>();
    for (const r of all) {
      const parsed = validateTemplateText(r.templateKey as MailTemplateKey, { subject: r.subject, body: r.body, action: r.actionLabel });
      if (parsed.ok) rows.set(`${r.templateKey}:${r.locale}`, parsed.value); // a row that no longer validates is ignored, never sent
    }
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  async override(key: MailTemplateKey, locale: MailTemplateLocale): Promise<MailTemplateText | null> {
    return (await this.rows()).get(`${key}:${locale}`) ?? null;
  }
}
