import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({ imports: [RolesModule], controllers: [InvitationsController], providers: [InvitationsService], exports: [InvitationsService] })
export class InvitationsModule {}
