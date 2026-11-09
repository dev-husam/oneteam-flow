import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const NUM = { maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false } as const;

export class CreateMetricDto {
  @ApiProperty({ example: 'resting_heart_rate' }) @Matches(/^[a-z][a-z0-9_]{1,58}$/) key!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ example: 'bpm' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 4 }) @IsOptional() @IsInt() @Min(0) @Max(4) precision?: number;
  @ApiPropertyOptional({ nullable: true, description: 'true = increases are good (strength), false = decreases are good (weight loss), omit = neutral.' })
  @IsOptional() @IsBoolean() higherIsBetter?: boolean;
}

export class CreateRecordDto {
  @ApiProperty() @IsUUID() subjectMembershipId!: string;
  @ApiProperty() @IsUUID() metricId!: string;
  @ApiProperty() @IsNumber(NUM) @Min(-1_000_000_000) @Max(1_000_000_000) value!: number;
  @ApiPropertyOptional({ description: 'When it was measured. Defaults to now; cannot be in the future.' }) @IsOptional() @IsDateString() recordedAt?: string;
}

export class VoidRecordDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) reason!: string;
}

export class SeriesQuery {
  @ApiProperty() @IsUUID() subjectMembershipId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() metricId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ maximum: 500 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class CreateGoalDto {
  @ApiProperty() @IsUUID() subjectMembershipId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() metricId?: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber(NUM) baselineValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber(NUM) targetValue?: number;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateGoalDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber(NUM) targetValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ABANDONED'] }) @IsOptional() @IsIn(['ACTIVE', 'ABANDONED']) status?: 'ACTIVE' | 'ABANDONED';
}

export class CreateMilestoneDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber(NUM) targetValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class GoalsQuery {
  @ApiProperty() @IsUUID() subjectMembershipId!: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ACHIEVED', 'ABANDONED'] }) @IsOptional() @IsIn(['ACTIVE', 'ACHIEVED', 'ABANDONED']) status?: 'ACTIVE' | 'ACHIEVED' | 'ABANDONED';
}

export class GroupSummaryQuery {
  @ApiProperty() @IsUUID() metricId!: string;
}
