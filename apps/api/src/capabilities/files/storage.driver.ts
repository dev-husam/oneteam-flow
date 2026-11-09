export interface UploadTarget {
  url: string;
  method: 'PUT';
  /** Headers the client must send with the upload. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/** Object storage behind one interface: local disk for development and tests, S3-compatible (R2) in production. */
export interface StorageDriver {
  presignUpload(key: string, opts: { contentType: string; sizeBytes: number }): Promise<UploadTarget>;
  presignDownload(key: string, opts: { fileName: string; contentType: string }): Promise<string>;
  /** Size of the stored object, or null when nothing was uploaded. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
  /** First bytes of the object (for content sniffing). */
  readHead(key: string, bytes: number): Promise<Uint8Array>;
  /** The whole object (used to remove metadata from images; files here are at most a few megabytes). */
  read(key: string): Promise<Uint8Array>;
  /** Replaces the object's bytes. */
  write(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE_DRIVER');
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60;
