import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { CreateResourceDto } from './resources.dto.js';
import { ResourcesService } from './resources.service.js';

class ListResourcesQuery {
  @IsOptional() @IsUUID() clientMembershipId?: string;
}

@ApiTags('coaching')
@ApiBearerAuth()
@RequiresModule('coaching')
@Controller('orgs/:orgId/coaching/resources')
export class ResourcesController {
  constructor(@Inject(ResourcesService) private readonly resources: ResourcesService) {}

  @Get()
  @RequirePermission('coaching.resource.read')
  async list(@Query() q: ListResourcesQuery) {
    return { data: await this.resources.list(q.clientMembershipId) };
  }

  @Post()
  @RequirePermission('coaching.resource.manage')
  async create(@Body() dto: CreateResourceDto) {
    return { data: await this.resources.create(dto) };
  }

  @Delete(':resourceId')
  @HttpCode(204)
  @RequirePermission('coaching.resource.manage')
  async archive(@Param('resourceId', new ParseUUIDPipe()) id: string) {
    await this.resources.archive(id);
  }
}
