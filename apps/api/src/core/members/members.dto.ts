import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

export class ListMembersQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Search in name and e-mail.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'REMOVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'REMOVED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}

export class ChangeRoleDto {
  @ApiProperty()
  @IsUUID()
  roleId!: string;
}
