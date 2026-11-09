import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RequestUploadDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MinLength(1) @MaxLength(255) fileName!: string;
  @ApiProperty({ example: 'image/jpeg' }) @IsString() @MaxLength(100) mimeType!: string;
  @ApiProperty({ description: 'Exact size in bytes; the signed upload URL accepts nothing else.' }) @IsInt() @Min(1) @Max(200 * 1024 ** 2) sizeBytes!: number;
  @ApiPropertyOptional({ enum: ['STANDARD', 'SENSITIVE'] }) @IsOptional() @IsIn(['STANDARD', 'SENSITIVE']) sensitivity?: 'STANDARD' | 'SENSITIVE';
}
