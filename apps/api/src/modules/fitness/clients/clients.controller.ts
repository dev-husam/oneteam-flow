import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission, RequiresModule } from '../../../core/rbac/decorators.js';
import { ListClientsQuery, UpdateClientProfileDto } from './clients.dto.js';
import { ClientsService } from './clients.service.js';

@ApiTags('fitness')
@ApiBearerAuth()
@RequiresModule('fitness')
@Controller('orgs/:orgId/fitness/clients')
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('fitness.client.read')
  list(@Query() q: ListClientsQuery) {
    return this.clients.list(q);
  }

  @Get(':membershipId')
  @RequirePermission('fitness.client.read')
  async get(@Param('membershipId', new ParseUUIDPipe()) id: string) {
    return { data: await this.clients.get(id) };
  }

  @Put(':membershipId/profile')
  @RequirePermission('fitness.client.update')
  async updateProfile(@Param('membershipId', new ParseUUIDPipe()) id: string, @Body() dto: UpdateClientProfileDto) {
    return { data: await this.clients.updateProfile(id, dto) };
  }
}
