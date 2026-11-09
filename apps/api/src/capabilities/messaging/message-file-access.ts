import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { requestContext } from '../../common/context/request-context.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { FileAccessRegistry, type FileReadPolicy } from '../files/file-access.js';

/** A file attached to a message can be read by the people in that conversation, and nobody else (deleted messages lose their links). */
@Injectable()
export class MessageFileAccess implements FileReadPolicy, OnModuleInit {
  constructor(
    @Inject(FileAccessRegistry) private readonly registry: FileAccessRegistry,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async canRead(fileId: string): Promise<boolean> {
    const me = requestContext.tenant().membershipId;
    const link = await this.tenant.db.messageAttachment.findFirst({
      where: { fileId, message: { deletedAt: null, conversation: { participants: { some: { membershipId: me } } } } },
      select: { fileId: true },
    });
    return link !== null;
  }
}
