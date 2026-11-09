import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/pagination.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { ActivityService } from './activity.service.js';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('orgs/:orgId/activity')
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get()
  @RequirePermission('activity.read')
  feed(@Query() q: PageQueryDto) {
    return this.activity.feed(q);
  }
}
