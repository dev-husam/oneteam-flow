import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS, type StorageDriver, type UploadTarget } from './storage.driver.js';

export interface S3Options {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3-compatible object storage (Cloudflare R2, AWS S3, MinIO-compatible servers). Clients talk to it directly via presigned URLs. */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;

  constructor(private readonly opts: S3Options) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async presignUpload(key: string, o: { contentType: string; sizeBytes: number }): Promise<UploadTarget> {
    // ContentLength and ContentType are part of the signature: the client cannot upload a different size or type.
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, ContentType: o.contentType, ContentLength: o.sizeBytes }), { expiresIn: UPLOAD_URL_TTL_SECONDS });
    return { url, method: 'PUT', headers: { 'Content-Type': o.contentType }, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  presignDownload(key: string, o: { fileName: string; contentType: string }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.opts.bucket, Key: key,
        ResponseContentType: o.contentType,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(o.fileName)}`,
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return { sizeBytes: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Uint8Array> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return r.Body ? r.Body.transformToByteArray() : new Uint8Array();
  }

  async read(key: string): Promise<Uint8Array> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    return r.Body ? r.Body.transformToByteArray() : new Uint8Array();
  }

  async write(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: bytes, ContentType: contentType }));
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }
}
