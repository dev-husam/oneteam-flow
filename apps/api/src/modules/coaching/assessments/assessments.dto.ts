import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ASSESSMENT_LIMITS } from '@pt/domain';
import { IsArray, IsInt, IsISO8601, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class TemplateDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(ASSESSMENT_LIMITS.name) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ASSESSMENT_LIMITS.description) description?: string;
  @ApiProperty({ description: 'Up to 20 questions: { id, kind: SCALE | YESNO | TEXT, label: { en, ar } }.' }) @IsArray() questions!: unknown[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(ASSESSMENT_LIMITS.name) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ASSESSMENT_LIMITS.description) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() questions?: unknown[];
}

export class RequestAssessmentDto {
  @ApiProperty() @IsUUID() templateId!: string;
  @ApiProperty() @IsUUID() clientMembershipId!: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) dueAt?: string;
  @ApiPropertyOptional({ description: 'Ask again this many days after each completion (7 to 365). Omit for a single request.' })
  @IsOptional() @IsInt() @Min(ASSESSMENT_LIMITS.minCadenceDays) @Max(ASSESSMENT_LIMITS.maxCadenceDays) cadenceDays?: number;
}

export class SubmitAssessmentDto {
  @ApiProperty({ description: 'Answers by question id: a number 1 to 10, true/false, or text.' }) @IsObject() answers!: Record<string, unknown>;
}

export class ListAssessmentsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiPropertyOptional({ enum: ['REQUESTED', 'COMPLETED', 'CANCELLED'] }) @IsOptional() @IsIn(['REQUESTED', 'COMPLETED', 'CANCELLED']) status?: 'REQUESTED' | 'COMPLETED' | 'CANCELLED';
}

export class TrendsQuery {
  @ApiProperty() @IsUUID() clientMembershipId!: string;
}
