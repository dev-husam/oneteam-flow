import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATEGORY_KEYS } from '@pt/domain';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const TIMEZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Iron Gym' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'URL address. Generated from the name when omitted (required for non-Latin names).', example: 'iron-gym' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  slug?: string;

  @ApiProperty({ enum: CATEGORY_KEYS })
  @IsIn([...CATEGORY_KEYS])
  categoryKey!: string;

  @ApiPropertyOptional({ example: 'Asia/Riyadh' })
  @IsOptional()
  @IsIn(TIMEZONES)
  timezone?: string;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  defaultLocale?: 'en' | 'ar';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+966501234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(TIMEZONES)
  timezone?: string;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  defaultLocale?: 'en' | 'ar';

  @ApiPropertyOptional({ minimum: 0, maximum: 6, description: '0 = Sunday … 6 = Saturday' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekStartsOn?: number;
}

export class OrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() categoryKey!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactEmail!: string | null;
  @ApiProperty({ nullable: true, type: String }) contactPhone!: string | null;
  @ApiProperty() timezone!: string;
  @ApiProperty() defaultLocale!: string;
  @ApiProperty() weekStartsOn!: number;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] }) status!: string;
  @ApiProperty() createdAt!: Date;
}

export function toOrganizationDto(o: {
  id: string; name: string; slug: string; description: string | null; contactEmail: string | null; contactPhone: string | null;
  timezone: string; defaultLocale: string; weekStartsOn: number; status: string; createdAt: Date; category: { key: string };
}): OrganizationDto {
  return {
    id: o.id, name: o.name, slug: o.slug, categoryKey: o.category.key, description: o.description,
    contactEmail: o.contactEmail, contactPhone: o.contactPhone, timezone: o.timezone, defaultLocale: o.defaultLocale,
    weekStartsOn: o.weekStartsOn, status: o.status, createdAt: o.createdAt,
  };
}
