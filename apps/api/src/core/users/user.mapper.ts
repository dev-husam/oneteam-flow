import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../generated/prisma/client.js';

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION'] }) status!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() mfaEnabled!: boolean;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty({ enum: ['en', 'ar'] }) locale!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ['METRIC', 'IMPERIAL'] }) unitSystem!: string;
  @ApiProperty() createdAt!: Date;
}

/** Explicit allow-list mapping: never serialize a Prisma row directly (passwordHash must not leak). */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    mfaEnabled: user.mfaEnabled,
    phoneVerified: user.phoneVerifiedAt !== null,
    locale: user.locale,
    timezone: user.timezone,
    unitSystem: user.unitSystem,
    createdAt: user.createdAt,
  };
}
