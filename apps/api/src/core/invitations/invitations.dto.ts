import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class CreateInvitationDto {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: 'Role to grant on acceptance (must be below your own rank).' })
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional({ description: 'Prefilled display name used in the e-mail.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone?: string;

  @ApiPropertyOptional({ description: 'Practitioner membership to assign the new member to on acceptance. Defaults to you when your member access is limited to assigned participants.' })
  @IsOptional()
  @IsUUID()
  assignToMembershipId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class ListInvitationsQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'])
  status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

export class InvitationTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token!: string;
}
