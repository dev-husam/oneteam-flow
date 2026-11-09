import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { MEAL_LOG_STATUSES, MEAL_TYPES } from '@pt/domain';
import { PageQueryDto } from '../../../common/pagination.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class MealItemDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) quantity?: number | null;
  @ApiPropertyOptional({ nullable: true, example: 'g' }) @IsOptional() @IsString() @MaxLength(20) unit?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() calories?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) proteinG?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) carbsG?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) fatG?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(300) notes?: string | null;
}

export class MealDto {
  @ApiProperty({ enum: MEAL_TYPES }) @IsIn([...MEAL_TYPES]) mealType!: (typeof MEAL_TYPES)[number];
  @ApiPropertyOptional({ nullable: true, example: '08:00' }) @IsOptional() @IsString() @MaxLength(5) timeOfDay?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
  @ApiProperty({ type: [MealItemDto] }) @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => MealItemDto) items!: MealItemDto[];
}

export class NutritionDayDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO weekday: 1 = Monday … 7 = Sunday.' }) @IsInt() weekday!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiProperty({ type: [MealDto] }) @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => MealDto) meals!: MealDto[];
}

/** The whole content of one draft version; saving replaces what the draft had. */
export class NutritionContentDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
  @ApiProperty({ type: [NutritionDayDto] }) @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => NutritionDayDto) days!: NutritionDayDto[];
}

export class CreateNutritionAssignmentsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() versionId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) clientMembershipIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) groupIds?: string[];
  @ApiProperty({ example: '2026-11-09' }) @Matches(YMD) startDate!: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @Matches(YMD) endDate?: string;
}

export class ListNutritionAssignmentsQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'CANCELLED'] }) @IsOptional() @IsIn(['ACTIVE', 'CANCELLED']) status?: 'ACTIVE' | 'CANCELLED';
}

export class TodayNutritionQuery {
  @ApiPropertyOptional({ example: '2026-11-09', description: 'A day in the organization\'s time zone; never in the future. Defaults to today.' }) @IsOptional() @Matches(YMD) date?: string;
}

export class LogMealDto {
  @ApiProperty() @IsUUID() assignmentId!: string;
  @ApiProperty() @IsUUID() mealId!: string;
  @ApiPropertyOptional({ example: '2026-11-09', description: 'Defaults to today; never in the future.' }) @IsOptional() @Matches(YMD) logDate?: string;
  @ApiProperty({ enum: MEAL_LOG_STATUSES }) @IsIn([...MEAL_LOG_STATUSES]) status!: (typeof MEAL_LOG_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string | null;
}

export class AttachPhotoDto {
  @ApiProperty() @IsUUID() fileId!: string;
}

export class MealLogsQuery {
  @ApiPropertyOptional({ description: 'Defaults to yourself.' }) @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiProperty({ example: '2026-11-03' }) @Matches(YMD) from!: string;
  @ApiProperty({ example: '2026-11-09' }) @Matches(YMD) to!: string;
}
