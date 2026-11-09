import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PlanExerciseDto {
  @ApiProperty() @IsUUID() exerciseId!: string;
  @ApiProperty() @IsInt() sets!: number;
  @ApiProperty() @IsInt() repsMin!: number;
  @ApiProperty() @IsInt() repsMax!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) targetWeightKg?: number | null;
  @ApiProperty() @IsInt() restSeconds!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(20) tempo?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Exercises sharing a number are performed back to back.' }) @IsOptional() @IsInt() supersetGroup?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class PlanDayDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiProperty({ type: [PlanExerciseDto] }) @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PlanExerciseDto) exercises!: PlanExerciseDto[];
}

/** The whole content of one draft version; saving replaces what the draft had. */
export class PlanContentDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @ApiProperty({ type: [PlanDayDto], description: 'Plan days in order (day 1 first); at most seven.' }) @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => PlanDayDto) days!: PlanDayDto[];
}

export class CreatePlanDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
}

export class ListPlansQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() archived?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
}

export class CreateVersionDto {
  @ApiPropertyOptional({ description: 'Copy this version into the new draft. Defaults to the current published version.' }) @IsOptional() @IsUUID() fromVersionId?: string;
}
