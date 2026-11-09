import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_MAX_ATTACHMENTS, MESSAGE_MAX_LENGTH, REPORT_NOTE_MAX, REPORT_REASONS, REPORT_STATUSES } from '@pt/domain';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';

export class StartConversationDto {
  @ApiProperty({ description: 'Membership id of the person to talk to (see GET /messaging/contacts).' }) @IsUUID() membershipId!: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({ maxLength: MESSAGE_MAX_LENGTH, description: 'Plain text. Required unless files are attached.' })
  @IsOptional() @IsString() @MaxLength(MESSAGE_MAX_LENGTH) body?: string;
  @ApiPropertyOptional({ type: [String], description: 'Ids of your own uploaded, non-sensitive files.' })
  @IsOptional() @IsArray() @ArrayMaxSize(MESSAGE_MAX_ATTACHMENTS) @ArrayUnique() @IsUUID('all', { each: true }) fileIds?: string[];
}

export class MarkReadDto {
  @ApiPropertyOptional({ description: 'Read up to and including this message. Omit to read everything.' }) @IsOptional() @IsUUID() messageId?: string;
}

export class SetMutedDto {
  @ApiProperty() @IsBoolean() muted!: boolean;
}

export class ContactsQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Part of a name.' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class SetBlockedDto {
  @ApiProperty() @IsBoolean() blocked!: boolean;
}

export class ReportMessageDto {
  @ApiProperty({ enum: REPORT_REASONS }) @IsIn([...REPORT_REASONS]) reason!: (typeof REPORT_REASONS)[number];
  @ApiPropertyOptional({ maxLength: REPORT_NOTE_MAX, description: 'What happened, in your words. Optional.' }) @IsOptional() @IsString() @MaxLength(REPORT_NOTE_MAX) note?: string;
}

export class ReportsQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES }) @IsOptional() @IsIn([...REPORT_STATUSES]) status?: (typeof REPORT_STATUSES)[number];
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['DISMISSED', 'ACTIONED'], description: 'DISMISSED: nothing to act on. ACTIONED: the moderator dealt with it (e.g. suspended the sender).' }) @IsIn(['DISMISSED', 'ACTIONED']) outcome!: 'DISMISSED' | 'ACTIONED';
  @ApiPropertyOptional({ maxLength: REPORT_NOTE_MAX }) @IsOptional() @IsString() @MaxLength(REPORT_NOTE_MAX) note?: string;
}
