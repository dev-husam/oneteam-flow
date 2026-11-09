import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NOTE_VISIBILITIES, SESSION_LIMITS, type NoteVisibility } from '@pt/domain';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty() @IsUUID() clientMembershipId!: string;
  @ApiPropertyOptional({ description: 'The session this note belongs to (optional).' }) @IsOptional() @IsUUID() sessionId?: string;
  @ApiProperty({ enum: NOTE_VISIBILITIES, description: 'PRIVATE: only you (and owners who hold the sensitive permission). SHARED: the client sees it too.' })
  @IsIn([...NOTE_VISIBILITIES]) visibility!: NoteVisibility;
  @ApiProperty({ maxLength: SESSION_LIMITS.note }) @IsString() @IsNotEmpty() @MaxLength(SESSION_LIMITS.note) body!: string;
}

export class UpdateNoteDto {
  @ApiPropertyOptional({ enum: NOTE_VISIBILITIES }) @IsOptional() @IsIn([...NOTE_VISIBILITIES]) visibility?: NoteVisibility;
  @ApiPropertyOptional({ maxLength: SESSION_LIMITS.note }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(SESSION_LIMITS.note) body?: string;
}

export class ListNotesQuery {
  @ApiProperty() @IsUUID() clientMembershipId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sessionId?: string;
}
