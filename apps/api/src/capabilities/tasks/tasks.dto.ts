import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export class CreateTaskDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn([...PRIORITIES]) priority?: (typeof PRIORITIES)[number];
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;
  @ApiPropertyOptional({ type: [String], description: 'Membership ids. Defaults to yourself when omitted and no group is given.' })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) assigneeMembershipIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Every active member of these groups is assigned individually.' })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) groupIds?: string[];
}

export class UpdateTaskDto {
  @ApiProperty({ description: 'The version you read. A mismatch means someone else changed the task (409).' })
  @IsInt() @Min(1) @Max(1_000_000) version!: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn([...PRIORITIES]) priority?: (typeof PRIORITIES)[number];
  @ApiPropertyOptional({ nullable: true, description: 'null removes the due date.' }) @ValidateIf((_, v) => v !== null) @IsOptional() @IsDateString() dueAt?: string | null;
  @ApiPropertyOptional({ enum: ['OPEN', 'CANCELLED'], description: 'CANCELLED cancels; OPEN reopens (status is re-derived from assignees).' })
  @IsOptional() @IsIn(['OPEN', 'CANCELLED']) status?: 'OPEN' | 'CANCELLED';
}

export class AddAssigneesDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) assigneeMembershipIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) groupIds?: string[];
}

export class SetStatusDto {
  @ApiProperty({ enum: ['PENDING', 'IN_PROGRESS', 'DONE'] }) @IsIn(['PENDING', 'IN_PROGRESS', 'DONE']) status!: 'PENDING' | 'IN_PROGRESS' | 'DONE';
}

export class CommentDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

export class AttachFileDto {
  @ApiProperty() @IsUUID() fileId!: string;
}

export class ListTasksQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] }) @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']) status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn([...PRIORITIES]) priority?: (typeof PRIORITIES)[number];
  @ApiPropertyOptional({ description: 'Membership id, or "me".' }) @IsOptional() @IsString() @MaxLength(36) assignee?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ description: 'Only overdue tasks.' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() overdue?: boolean;
}
