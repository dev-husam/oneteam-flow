import { createHash, randomBytes } from 'node:crypto';

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** 256-bit URL-safe random token. Only its SHA-256 hash is ever stored. */
export const randomToken = (): string => randomBytes(32).toString('base64url');
