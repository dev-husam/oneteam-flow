import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';

const tokenOf = (url: string) => url.split('/').pop()!;

describe('LocalStorageDriver', () => {
  const make = async () => new LocalStorageDriver(await mkdtemp(join(tmpdir(), 'pt-storage-')), 'http://api.test', 'secret-one');

  it('signs URLs that verify only for their operation and until they expire', async () => {
    const d = await make();
    const up = await d.presignUpload('org/o1/files/f1', { contentType: 'image/png', sizeBytes: 10 });
    expect(up.url).toMatch(/^http:\/\/api\.test\/api\/v1\/storage\/upload\//);
    expect(up.expiresInSeconds).toBe(900);
    expect(d.verify(tokenOf(up.url), 'upload')).toMatchObject({ key: 'org/o1/files/f1', max: 10, type: 'image/png' });
    expect(d.verify(tokenOf(up.url), 'download')).toBeNull();
    const down = await d.presignDownload('org/o1/files/f1', { fileName: 'a.png', contentType: 'image/png' });
    expect(d.verify(tokenOf(down), 'download')?.name).toBe('a.png');
  });

  it('rejects tampered tokens and tokens signed with another secret', async () => {
    const d = await make();
    const url = (await d.presignDownload('k', { fileName: 'a', contentType: 'text/plain' }));
    const [payload, sig] = tokenOf(url).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), key: 'other' })).toString('base64url');
    expect(d.verify(`${forged}.${sig}`, 'download')).toBeNull();
    const other = new LocalStorageDriver('/tmp/x', 'http://api.test', 'secret-two');
    expect(other.verify(tokenOf(url), 'download')).toBeNull();
    expect(d.verify('garbage', 'download')).toBeNull();
    expect(d.verify('a.b', 'download')).toBeNull();
  });

  it('never resolves a key outside its directory', async () => {
    const d = await make();
    expect(() => d.path('../../etc/passwd')).toThrow('Invalid storage key');
    expect(() => d.path('org/../../outside')).toThrow('Invalid storage key');
    expect(d.path('org/o1/files/f1')).toContain('org/o1/files/f1');
  });

  it('heads, reads the first bytes, and deletes', async () => {
    const d = await make();
    expect(await d.head('org/o1/files/f1')).toBeNull();
    const target = await d.prepare('org/o1/files/f1');
    await writeFile(target, Buffer.from('%PDF-1.7 rest of the file'));
    expect(await d.head('org/o1/files/f1')).toEqual({ sizeBytes: 25 });
    expect(Buffer.from(await d.readHead('org/o1/files/f1', 5)).toString()).toBe('%PDF-');
    expect((await readFile(target)).length).toBe(25);
    await d.delete('org/o1/files/f1');
    expect(await d.head('org/o1/files/f1')).toBeNull();
  });
});

describe('S3StorageDriver (presigning is local computation: no network needed)', () => {
  const d = new S3StorageDriver({ bucket: 'bucket', endpoint: 'https://account.r2.example.com', region: 'auto', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' });

  it('presigns uploads that bind type and size to the signature', async () => {
    const up = await d.presignUpload('org/o1/files/f1', { contentType: 'image/png', sizeBytes: 1234 });
    const url = new URL(up.url);
    expect(url.origin).toBe('https://account.r2.example.com');
    expect(url.pathname).toBe('/bucket/org/o1/files/f1');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(up.headers).toEqual({ 'Content-Type': 'image/png' });
  });

  it('presigns 60-second private downloads with a safe file name', async () => {
    const url = new URL(await d.presignDownload('org/o1/files/f1', { fileName: 'plan "final".pdf', contentType: 'application/pdf' }));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
    expect(url.searchParams.get('response-content-disposition')).toContain("filename*=UTF-8''plan%20%22final%22.pdf");
  });
});
