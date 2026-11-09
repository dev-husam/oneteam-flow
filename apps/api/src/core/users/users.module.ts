import { Module } from '@nestjs/common';
import { MeDesignController } from './me-design.controller.js';
import { MeDesignService } from './me-design.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({ controllers: [UsersController, MeDesignController], providers: [UsersService, MeDesignService], exports: [UsersService] })
export class UsersModule {}
