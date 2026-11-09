import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { FileAccessRegistry, type FileReadPolicy } from '../../../capabilities/files/file-access.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { ResourcesService } from './resources.service.js';

/** A file shared as a coaching resource can be read by the people who can see that resource (and only while it is not withdrawn). */
@Injectable()
export class CoachingFileAccess implements FileReadPolicy, OnModuleInit {
  constructor(
    @Inject(FileAccessRegistry) private readonly registry: FileAccessRegistry,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(ResourcesService) private readonly resources: ResourcesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async canRead(fileId: string): Promise<boolean> {
    const r = await this.tenant.db.coachResource.findFirst({ where: { fileId, archivedAt: null }, select: { createdByMembershipId: true, clientMembershipId: true } });
    return r ? this.resources.canSee(r) : false;
  }
}
