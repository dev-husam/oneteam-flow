import type { StoredFile } from '@pt/api-client';
import { api } from '@/lib/api';

/** Photos of a person's body are sensitive: JPEG or PNG only, so the server can strip location and camera data. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
export const isPhotoType = (type: string): boolean => (PHOTO_TYPES as readonly string[]).includes(type);

export function uploadImage(orgId: string, file: File, opts: { sensitive: boolean }): Promise<StoredFile> {
  return api.org(orgId).files.upload({ fileName: file.name, mimeType: file.type, body: file, sensitivity: opts.sensitive ? 'SENSITIVE' : 'STANDARD' });
}
