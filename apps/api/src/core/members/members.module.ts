import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({ imports: [RolesModule], controllers: [MembersController], providers: [MembersService], exports: [MembersService] })
export class MembersModule {}
