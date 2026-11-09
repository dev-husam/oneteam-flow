import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Display name for the From header (administrator-configured); the address always comes from MAIL_FROM. */
  fromName?: string;
}

/** In-process outbox used when MAIL_TRANSPORT=memory (tests only; rejected in production). */
export const memoryOutbox: OutgoingMail[] = [];

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(mail: OutgoingMail): Promise<void> {
    if (this.config.MAIL_TRANSPORT === 'memory') {
      memoryOutbox.push(mail);
      return;
    }
    this.transporter ??= createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      secure: this.config.SMTP_PORT === 465,
      auth: this.config.SMTP_USER
        ? { user: this.config.SMTP_USER, pass: this.config.SMTP_PASSWORD }
        : undefined,
    });
    const { fromName, ...message } = mail;
    const address = /<([^>]+)>/.exec(this.config.MAIL_FROM)?.[1] ?? this.config.MAIL_FROM;
    await this.transporter.sendMail({ from: fromName ? { name: fromName, address } : this.config.MAIL_FROM, ...message });
    this.logger.log({ event: 'mail.sent', subject: mail.subject }, 'Mail sent');
  }
}
