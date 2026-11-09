import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Membership of the trainer / teacher / coach.' })
  @IsUUID()
  practitionerMembershipId!: string;

  @ApiProperty({ description: 'Membership of the client / student / member.' })
  @IsUUID()
  participantMembershipId!: string;

  @ApiPropertyOptional({ enum: ['PRIMARY', 'SECONDARY'], default: 'PRIMARY' })
  @IsOptional()
  @IsIn(['PRIMARY', 'SECONDARY'])
  kind?: 'PRIMARY' | 'SECONDARY';
}

export class ListAssignmentsQuery extends PageQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  practitionerMembershipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  participantMembershipId?: string;

  @ApiPropertyOptional({ default: true, description: 'false lists ended assignments (history).' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}
