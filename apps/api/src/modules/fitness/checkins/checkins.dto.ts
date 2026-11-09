import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { CHECKIN_STATUSES, PHOTO_ANGLES, PHOTO_KINDS } from '@pt/domain';
import { PageQueryDto } from '../../../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Every field is optional: absent = unchanged, null = cleared. */
export class SaveCheckinDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) clientNotes?: string | null;
  @ApiPropertyOptional({ description: 'Measurement key → value, e.g. { "weight_kg": 82.4 }. null removes a value.', example: { weight_kg: 82.4, waist_cm: 91 } })
  @IsOptional() @IsObject() measurements?: Record<string, number | null>;
}

export class AddPhotoDto {
  @ApiProperty() @IsUUID() fileId!: string;
  @ApiProperty({ enum: PHOTO_ANGLES }) @IsIn([...PHOTO_ANGLES]) angle!: (typeof PHOTO_ANGLES)[number];
  @ApiProperty({ enum: PHOTO_KINDS }) @IsIn([...PHOTO_KINDS]) kind!: (typeof PHOTO_KINDS)[number];
  @ApiPropertyOptional({ description: 'Required for WEEKLY photos: the draft check-in they belong to.' }) @IsOptional() @IsUUID() checkinId?: string;
  @ApiPropertyOptional({ example: '2026-11-09', description: 'Defaults to today; never in the future.' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) takenOn?: string;
}

export class ListCheckinsQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiPropertyOptional({ enum: CHECKIN_STATUSES }) @IsOptional() @IsIn([...CHECKIN_STATUSES]) status?: (typeof CHECKIN_STATUSES)[number];
}

export class ReviewCheckinDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) feedback?: string | null;
}

export class CheckinCommentDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) body!: string;
}

export class CompareQuery {
  @ApiProperty() @IsUUID() from!: string;
  @ApiProperty() @IsUUID() to!: string;
}
