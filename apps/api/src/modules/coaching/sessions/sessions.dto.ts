import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SESSION_LIMITS, SESSION_STATUSES, type SessionStatus } from '@pt/domain';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty() @IsUUID() clientMembershipId!: string;
  @ApiProperty({ description: 'ISO 8601 date and time.' }) @IsISO8601({ strict: true }) startsAt!: string;
  @ApiProperty({ minimum: SESSION_LIMITS.minMinutes, maximum: SESSION_LIMITS.maxMinutes }) @IsInt() @Min(SESSION_LIMITS.minMinutes) @Max(SESSION_LIMITS.maxMinutes) durationMinutes!: number;
  @ApiPropertyOptional({ description: 'A place or a meeting link.' }) @IsOptional() @IsString() @MaxLength(SESSION_LIMITS.location) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SESSION_LIMITS.agenda) agenda?: string;
}

export class UpdateSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(SESSION_LIMITS.minMinutes) @Max(SESSION_LIMITS.maxMinutes) durationMinutes?: number;
  @ApiPropertyOptional({ description: 'Empty string clears it.' }) @IsOptional() @IsString() @MaxLength(SESSION_LIMITS.location) location?: string;
  @ApiPropertyOptional({ description: 'Empty string clears it.' }) @IsOptional() @IsString() @MaxLength(SESSION_LIMITS.agenda) agenda?: string;
}

export class CancelSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SESSION_LIMITS.cancelReason) reason?: string;
}

export class ListSessionsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiPropertyOptional({ enum: SESSION_STATUSES }) @IsOptional() @IsIn([...SESSION_STATUSES]) status?: SessionStatus;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}
