import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateResourceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ description: 'An http(s) link. Give a link, a file, or both.' }) @IsOptional() @IsString() @MaxLength(500) @Matches(/^https?:\/\/[^\s<>"]+$/i, { message: 'url must be an http(s) address' }) url?: string;
  @ApiPropertyOptional({ description: 'Id of your own finished, non-sensitive upload.' }) @IsOptional() @IsUUID() fileId?: string;
  @ApiPropertyOptional({ description: 'Share with one client. Omit to share with every client assigned to you.' }) @IsOptional() @IsUUID() clientMembershipId?: string;
}
