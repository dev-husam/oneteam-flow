import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { requestContext } from '../../../common/context/request-context.js';
import { AuthorizationService } from '../../../core/rbac/authorization.service.js';
import { FeaturesService } from '../../../core/rbac/features.service.js';
import { TenantPrismaService } from '../../../core/tenancy/tenant-prisma.service.js';
import { FileAccessRegistry, type FileReadPolicy } from '../../../capabilities/files/file-access.js';

/**
 * Who may read the files Fitness owns. Progress photos: the client, and people with `fitness.photo.read` for that
 * client (reads are audited by the file service because the files are SENSITIVE); drafts are private to the client.
 * Meal photos: whoever may read the client's nutrition.
 */
@Injectable()
export class FitnessFileAccess implements FileReadPolicy, OnModuleInit {
  constructor(
    @Inject(FileAccessRegistry) private readonly registry: FileAccessRegistry,
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(AuthorizationService) private readonly authz: AuthorizationService,
    @Inject(FeaturesService) private readonly features: FeaturesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async canRead(fileId: string): Promise<boolean> {
    const me = requestContext.tenant().membershipId;
    const photo = await this.tenant.db.fitProgressPhoto.findFirst({ where: { fileId }, include: { checkin: { select: { status: true } } } });
    if (photo) {
      // Switching progress photos off for an organization closes the existing photos too.
      if (!(await this.features.isEnabled('progress_photos', requestContext.tenant().orgId))) return false;
      if (photo.checkin?.status === 'DRAFT' && photo.clientMembershipId !== me) return false;
      return this.authz.allows('fitness.photo.read', { subjectMembershipId: photo.clientMembershipId });
    }
    const meal = await this.tenant.db.fitMealLogPhoto.findFirst({ where: { fileId }, include: { mealLog: { select: { clientMembershipId: true } } } });
    if (meal) return this.authz.allows('fitness.nutrition.read', { subjectMembershipId: meal.mealLog.clientMembershipId });
    return false;
  }
}
