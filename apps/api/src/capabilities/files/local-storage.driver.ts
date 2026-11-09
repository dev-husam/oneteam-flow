import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DOWNLOAD_URL_TTL_SECONDS, UPLOAD_URL_TTL_SECONDS, type StorageDriver, type UploadTarget } from './storage.driver.js';

export type Operation = 'upload' | 'download';
export interface SignedClaims {
  op: Operation;
  key: string;
  exp: number;
  /** upload: maximum bytes; download: unused */
  max: number;
  type: string;
  name: string;
}

/**
 * Development/test storage: files on local disk, reachable only through short-lived HMAC-signed URLs served by
 * this API, mirroring how presigned S3 URLs behave (expiry, one operation per URL, size cap on uploads).
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(
    private readonly dir: string,
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  // ---- signing

  private mac(c: SignedClaims): string {
    return createHmac('sha256', this.secret).update(JSON.stringify([c.op, c.key, c.exp, c.max, c.type, c.name])).digest('base64url');
  }

  private sign(c: SignedClaims): string {
    const payload = Buffer.from(JSON.stringify(c)).toString('base64url');
    return `${payload}.${this.mac(c)}`;
  }

  /** Returns the claims of a valid, unexpired token for this operation, or null. */
  verify(token: string, op: Operation): SignedClaims | null {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SignedClaims;
      const expected = Buffer.from(this.mac(claims));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      if (claims.op !== op || claims.exp * 1000 < Date.now()) return null;
      return claims;
    } catch {
      return null;
    }
  }

  // ---- paths (the key is always resolved under the storage directory: no traversal)

  path(key: string): string {
    const root = resolve(this.dir);
    const full = resolve(root, key);
    if (full !== root && !full.startsWith(root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async prepare(key: string): Promise<string> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    return target;
  }

  openRead(key: string) {
    return createReadStream(this.path(key));
  }

  // ---- StorageDriver

  async presignUpload(key: string, opts: { contentType: string; sizeBytes: number }): Promise<UploadTarget> {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const token = this.sign({ op: 'upload', key, exp, max: opts.sizeBytes, type: opts.contentType, name: '' });
    return { url: `${this.baseUrl}/api/v1/storage/upload/${token}`, method: 'PUT', headers: { 'Content-Type': opts.contentType }, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  async presignDownload(key: string, opts: { fileName: string; contentType: string }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS;
    return `${this.baseUrl}/api/v1/storage/download/${this.sign({ op: 'download', key, exp, max: 0, type: opts.contentType, name: opts.fileName })}`;
  }

  async head(key: string) {
    try {
      return { sizeBytes: (await stat(this.path(key))).size };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Uint8Array> {
    const handle = await open(this.path(key), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(this.path(key));
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    const target = await this.prepare(key);
    const tmp = `${target}.part`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
