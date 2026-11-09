import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAssignmentsDto {
  @ApiPropertyOptional({ description: 'A published version of the plan. Defaults to the current one.' }) @IsOptional() @IsUUID() versionId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) clientMembershipIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Every active member of these groups that you may assign to.' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) groupIds?: string[];
  @ApiProperty({ example: '2026-11-09', description: 'First day, in the organization\'s time zone. Not in the past.' }) @Matches(YMD) startDate!: string;
  @ApiPropertyOptional({ example: '2026-12-31' }) @IsOptional() @Matches(YMD) endDate?: string;
  @ApiProperty({ example: { '1': 1, '2': 3, '3': 5 }, description: 'Plan day number → ISO weekday (1 = Monday … 7 = Sunday). Each day on its own weekday.' }) @IsObject() weeklySchedule!: Record<string, number>;
}

export class ListAssignmentsQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMembershipId?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'CANCELLED'] }) @IsOptional() @IsIn(['ACTIVE', 'CANCELLED']) status?: 'ACTIVE' | 'CANCELLED';
}

export class StartSessionDto {
  @ApiProperty() @IsUUID() assignmentId!: string;
  @ApiProperty() @IsUUID() dayId!: string;
  @ApiPropertyOptional({ example: '2026-11-09', description: 'Defaults to today (organization time zone); never in the future.' }) @IsOptional() @Matches(YMD) scheduledDate?: string;
}

export class LogSetDto {
  @ApiProperty() @IsUUID() dayExerciseId!: string;
  @ApiProperty({ minimum: 1, maximum: 30 }) @IsInt() @Min(1) @Max(30) setNo!: number;
  @ApiProperty({ minimum: 0, maximum: 500 }) @IsInt() @Min(0) @Max(500) repsDone!: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000) weightKg?: number | null;
}

export class CompleteSessionDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: 'Rate of perceived exertion.' }) @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
}

export class ListSessionsQuery extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Defaults to yourself.' }) @IsOptional() @IsUUID() clientMembershipId?: string;
}
