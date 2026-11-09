import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class GrantDto {
  @ApiProperty({ example: 'member.read' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ enum: ['OWN', 'ASSIGNED', 'ORG'] })
  @IsIn(['OWN', 'ASSIGNED', 'ORG'])
  scope!: 'OWN' | 'ASSIGNED' | 'ORG';
}

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 99, description: 'Must be below your own role rank.' })
  @IsInt()
  @Min(1)
  @Max(99)
  rank!: number;

  @ApiPropertyOptional({ description: 'Copy grants from this role when `grants` is omitted.' })
  @IsOptional()
  @IsUUID()
  templateRoleId?: string;

  @ApiPropertyOptional({ type: [GrantDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  grants?: GrantDto[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  rank?: number;

  @ApiPropertyOptional({ type: [GrantDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  grants?: GrantDto[];
}
