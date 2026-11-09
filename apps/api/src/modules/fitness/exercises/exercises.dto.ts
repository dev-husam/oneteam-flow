import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { EQUIPMENT, MUSCLE_GROUPS } from '@pt/domain';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListExercisesQuery {
  @ApiPropertyOptional({ enum: MUSCLE_GROUPS }) @IsOptional() @IsIn([...MUSCLE_GROUPS]) muscleGroup?: (typeof MUSCLE_GROUPS)[number];
  @ApiPropertyOptional({ enum: EQUIPMENT }) @IsOptional() @IsIn([...EQUIPMENT]) equipment?: (typeof EQUIPMENT)[number];
  @ApiPropertyOptional({ description: 'Matches the English or Arabic name.' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional({ description: 'Include archived exercises (needs the manage permission).' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() archived?: boolean;
}

export class CreateExerciseDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nameAr?: string;
  @ApiProperty({ enum: MUSCLE_GROUPS }) @IsIn([...MUSCLE_GROUPS]) muscleGroup!: (typeof MUSCLE_GROUPS)[number];
  @ApiProperty({ enum: EQUIPMENT }) @IsIn([...EQUIPMENT]) equipment!: (typeof EQUIPMENT)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) instructions?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) instructionsAr?: string;
  @ApiPropertyOptional({ description: 'https link to a demonstration video (hosted elsewhere).' })
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) videoUrl?: string;
}

export class UpdateExerciseDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) nameAr?: string;
  @ApiPropertyOptional({ enum: MUSCLE_GROUPS }) @IsOptional() @IsIn([...MUSCLE_GROUPS]) muscleGroup?: (typeof MUSCLE_GROUPS)[number];
  @ApiPropertyOptional({ enum: EQUIPMENT }) @IsOptional() @IsIn([...EQUIPMENT]) equipment?: (typeof EQUIPMENT)[number];
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) instructions?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) instructionsAr?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) videoUrl?: string;
}
