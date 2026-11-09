import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ACTIVITY_LEVELS, GOAL_TYPES, SEXES } from '@pt/domain';
import { PageQueryDto } from '../../../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListClientsQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Matches name or email.' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
}

/** Every field is optional: absent = unchanged, null = cleared. */
export class UpdateClientProfileDto {
  @ApiPropertyOptional({ nullable: true, example: '1990-04-23' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateOfBirth?: string | null;
  @ApiPropertyOptional({ nullable: true, enum: SEXES }) @IsOptional() @IsIn([...SEXES]) sex?: (typeof SEXES)[number] | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(50) @Max(260) heightCm?: number | null;
  @ApiPropertyOptional({ nullable: true, enum: GOAL_TYPES }) @IsOptional() @IsIn([...GOAL_TYPES]) goalType?: (typeof GOAL_TYPES)[number] | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) goalsText?: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ACTIVITY_LEVELS }) @IsOptional() @IsIn([...ACTIVITY_LEVELS]) activityLevel?: (typeof ACTIVITY_LEVELS)[number] | null;
  @ApiPropertyOptional({ nullable: true, description: 'Health notes (injuries, conditions). Stored encrypted.' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) injuriesNotes?: string | null;
  @ApiPropertyOptional({ description: 'Recorded once as the first weight measurement ("starting weight").' }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(20) @Max(500) startingWeightKg?: number;
}
