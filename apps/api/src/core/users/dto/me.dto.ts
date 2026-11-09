import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const TIMEZONES = new Set<string>([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, example: '+9665XXXXXXXX', description: 'E.164 format. null removes the number.' })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';

  @ApiPropertyOptional({ example: 'Asia/Riyadh' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsIn([...TIMEZONES])
  timezone?: string;

  @ApiPropertyOptional({ enum: ['METRIC', 'IMPERIAL'] })
  @IsOptional()
  @IsIn(['METRIC', 'IMPERIAL'])
  unitSystem?: 'METRIC' | 'IMPERIAL';
}

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;

export class RegisterDeviceDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @Matches(EXPO_TOKEN)
  @MaxLength(255)
  expoPushToken!: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID'] })
  @IsIn(['IOS', 'ANDROID'])
  platform!: 'IOS' | 'ANDROID';

  @ApiProperty({ enum: ['en', 'ar'] })
  @IsIn(['en', 'ar'])
  locale!: 'en' | 'ar';
}

export class UnregisterDeviceDto {
  @ApiProperty()
  @Matches(EXPO_TOKEN)
  @MaxLength(255)
  expoPushToken!: string;
}
