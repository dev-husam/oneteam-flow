import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

export class AdminListUsersQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'] }) @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'PENDING_DELETION']) status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION';
}

export class AdminListOrganizationsQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] }) @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'ARCHIVED']) status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) categoryKey?: string;
}

export class AdminAuditQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
}

export class CatalogStatusDto {
  @ApiProperty({ enum: ['ENABLED', 'DISABLED'] })
  @IsIn(['ENABLED', 'DISABLED'])
  status!: 'ENABLED' | 'DISABLED';
}

export class PlatformRoleDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty({ enum: ['super_admin'] }) @IsIn(['super_admin']) roleKey!: 'super_admin';
}
