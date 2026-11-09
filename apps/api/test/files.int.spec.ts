import { readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDF, PNG, as, buildOrg, createTestApp, uploadFile, type OrgFixture, type TestApp } from './helpers/app.js';

const code = (r: { body: { error?: { code?: string } } }) => r.body.error?.code;

describe('file management', () => {
  let t: TestApp;
  let F: OrgFixture;
  let base: string;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Files Gym');
    base = `/api/v1/orgs/${F.orgId}/files`;
  });
  afterAll(async () => t.app.close());

  const request = (who: keyof OrgFixture, body: object) => as(t, F[who] as OrgFixture['owner']).post(`${base}/uploads`, body);
  const put = (url: string, bytes: Buffer, type: string) => t.http().put(new URL(url).pathname).set('Content-Type', type).send(bytes);

  describe('requesting an upload', () => {
    it('validates declared type and size before anything is stored', async () => {
      expect(code(await request('participant', { fileName: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 100 }))).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(code(await request('participant', { fileName: 'a.svg', mimeType: 'image/svg+xml', sizeBytes: 100 }))).toBe('FILE_TYPE_NOT_ALLOWED');
      const big = await request('participant', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 11 * 1024 ** 2 });
      expect(big.status).toBe(413);
      expect(code(big)).toBe('FILE_TOO_LARGE');
      expect((await request('participant', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 0 })).status).toBe(400);
      expect((await request('participant', { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, uploader: 'x' })).status).toBe(400);
      expect(await t.prisma.file.count({ where: { originalName: 'a.exe' } })).toBe(0);
    });

    it('returns a pending record and a signed single-purpose URL; keys are namespaced by organization', async () => {
      const res = await request('participant', { fileName: '../../etc/passwd.png', mimeType: 'image/png', sizeBytes: PNG.length });
      expect(res.status).toBe(201);
      expect(res.body.data.file).toMatchObject({ name: 'passwd.png', mimeType: 'image/png', status: 'PENDING_UPLOAD', sensitivity: 'STANDARD', mine: true });
      expect(res.body.data.upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });
      const row = await t.prisma.file.findUniqueOrThrow({ where: { id: res.body.data.file.id } });
      expect(row.storageKey).toMatch(new RegExp(`^org/${F.orgId}/files/[0-9a-f-]{36}$`));
    });

    it('guardians cannot upload (no file.upload)', async () => {
      expect(code(await request('guardian', { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 10 }))).toBe('FORBIDDEN');
    });
  });

  describe('uploading to the signed URL', () => {
    const open = async (bytes: Buffer, mimeType: string, size = bytes.length) => (await request('participant', { fileName: 'x', mimeType, sizeBytes: size }).then((r) => r)).body.data;

    it('accepts exactly the declared bytes and type; completes into READY', async () => {
      const { file, upload } = await open(PNG, 'image/png');
      await put(upload.url, PNG, 'image/png').expect(200);
      const done = await as(t, F.participant).post(`${base}/${file.id}/complete`).expect(200);
      expect(done.body.data).toMatchObject({ status: 'READY', sizeBytes: PNG.length });
      await as(t, F.participant).post(`${base}/${file.id}/complete`).expect(200); // idempotent
    });

    it('refuses a different size or content type, and tampered, foreign or expired signatures', async () => {
      const { upload } = await open(PNG, 'image/png');
      expect((await put(upload.url, Buffer.concat([PNG, Buffer.alloc(50)]), 'image/png')).status).toBe(413);
      expect((await put(upload.url, PNG.subarray(0, 8), 'image/png')).status).toBe(413);
      expect((await put(upload.url, PNG, 'application/pdf')).status).toBe(422);

      const tampered = upload.url.slice(0, -3) + 'AAA';
      expect((await put(tampered, PNG, 'image/png')).status).toBe(403);
      const [payload, sig] = new URL(upload.url).pathname.split('/').pop()!.split('.');
      const forged = JSON.parse(Buffer.from(payload!, 'base64url').toString());
      forged.key = `org/${F.orgId}/files/someone-elses-object`;
      const forgedUrl = `/api/v1/storage/upload/${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
      expect((await t.http().put(forgedUrl).set('Content-Type', 'image/png').send(PNG)).status).toBe(403);

      const expired = { ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), exp: 1 };
      expect((await t.http().put(`/api/v1/storage/upload/${Buffer.from(JSON.stringify(expired)).toString('base64url')}.${sig}`).set('Content-Type', 'image/png').send(PNG)).status).toBe(403);
      // an upload URL is not a download URL
      expect((await t.http().get(new URL(upload.url).pathname.replace('/upload/', '/download/'))).status).toBe(404);
    });

    it('completing without uploading fails; a disguised file is rejected and removed', async () => {
      const empty = await open(PNG, 'image/png');
      expect(code(await as(t, F.participant).post(`${base}/${empty.file.id}/complete`))).toBe('FILE_NOT_UPLOADED');

      const html = Buffer.from('<html><script>alert(1)</script></html>');
      const fake = await open(html, 'image/png', html.length);
      await put(fake.upload.url, html, 'image/png').expect(200);
      const res = await as(t, F.participant).post(`${base}/${fake.file.id}/complete`);
      expect(res.status).toBe(422);
      expect(code(res)).toBe('FILE_REJECTED');
      const row = await t.prisma.file.findUniqueOrThrow({ where: { id: fake.file.id } });
      expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'content_mismatch' });
      const key = row.storageKey.split('/').pop()!;
      const stored = readdirSync(`${process.env.STORAGE_LOCAL_DIR}/org/${F.orgId}/files`);
      expect(stored).not.toContain(key); // the object itself is gone
      expect(code(await as(t, F.participant).post(`${base}/${fake.file.id}/complete`))).toBe('FILE_REJECTED');
    });

    it('only the uploader can complete', async () => {
      const { file, upload } = await open(PNG, 'image/png');
      await put(upload.url, PNG, 'image/png').expect(200);
      expect((await as(t, F.manager).post(`${base}/${file.id}/complete`)).status).toBe(404);
    });
  });

  describe('reading', () => {
    it('the uploader gets a short-lived signed download URL that serves the bytes privately', async () => {
      const f = await uploadFile(t, F.participant, F.orgId, PDF, 'application/pdf', 'plan "final".pdf');
      const { url, expiresInSeconds } = (await as(t, F.participant).get(`${base}/${f.id}/download-url`).expect(200)).body.data;
      expect(expiresInSeconds).toBe(60);
      const res = await t.http().get(new URL(url).pathname).expect(200);
      expect(res.body.toString()).toBe(PDF.toString());
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(encodeURIComponent('plan final.pdf'));
    });

    it('a file that is not attached anywhere is private to its uploader, even from managers and owners', async () => {
      const f = await uploadFile(t, F.participant, F.orgId, PNG, 'image/png');
      for (const who of ['manager', 'owner', 'practitioner', 'participant2'] as const) {
        expect((await as(t, F[who]).get(`${base}/${f.id}`)).status, who).toBe(404);
        expect((await as(t, F[who]).get(`${base}/${f.id}/download-url`)).status, who).toBe(404);
      }
    });

    it('sensitive downloads are audited', async () => {
      const req = await request('participant', { fileName: 'scan.png', mimeType: 'image/png', sizeBytes: PNG.length, sensitivity: 'SENSITIVE' });
      await put(req.body.data.upload.url, PNG, 'image/png').expect(200);
      await as(t, F.participant).post(`${base}/${req.body.data.file.id}/complete`).expect(200);
      await as(t, F.participant).get(`${base}/${req.body.data.file.id}/download-url`).expect(200);
      expect(await t.prisma.auditLog.count({ where: { organizationId: F.orgId, action: 'file.accessed', targetId: req.body.data.file.id } })).toBe(1);
    });

    it('deleting removes access and the object; only the uploader can delete', async () => {
      const f = await uploadFile(t, F.participant, F.orgId, PNG, 'image/png');
      expect((await as(t, F.owner).del(`${base}/${f.id}`)).status).toBe(404);
      await as(t, F.participant).del(`${base}/${f.id}`).expect(204);
      expect((await as(t, F.participant).get(`${base}/${f.id}`)).status).toBe(404);
      expect((await as(t, F.participant).get(`${base}/${f.id}/download-url`)).status).toBe(404);
    });
  });
});

describe('photo privacy (metadata removal and sensitive formats)', () => {
  let t: TestApp;
  let F: OrgFixture;
  beforeAll(async () => {
    t = await createTestApp();
    F = await buildOrg(t, 'Photo Gym');
  });
  afterAll(async () => t.app.close());
  const base = () => `/api/v1/orgs/${F.orgId}/files`;
  const stored = async (fileId: string) => {
    const { readFile } = await import('node:fs/promises');
    const row = await t.prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    return { row, bytes: await readFile(`${process.env.STORAGE_LOCAL_DIR}/${row.storageKey}`) };
  };

  it('removes GPS and camera data from a JPEG but keeps its orientation and picture data, and records the new size', async () => {
    const { GPS_MARKER, jpegWithGps } = await import('./helpers/app.js');
    const original = jpegWithGps();
    expect(original.toString('latin1')).toContain(GPS_MARKER);
    const f = await uploadFile(t, F.participant, F.orgId, original, 'image/jpeg', 'me.jpg', 'SENSITIVE');
    const { row, bytes } = await stored(f.id);
    const text = bytes.toString('latin1');
    expect(text).not.toContain(GPS_MARKER);
    expect(text).not.toContain('GPS');
    expect(text).toContain('JFIF');
    expect(bytes.subarray(-6).toString('hex')).toBe('3f0012' + '34ffd9'); // scan data untouched
    const at = text.indexOf('Exif');
    expect(at).toBeGreaterThan(0);
    expect(bytes[at + 6 + 8 + 2 + 9]).toBe(6); // orientation kept: a portrait photo does not turn sideways
    expect(row.sizeBytes).toBe(BigInt(bytes.length));
    expect(bytes.length).toBeLessThan(original.length);
  });

  it('refuses sensitive images that cannot be cleaned (HEIC, WebP) and photos that are not well-formed', async () => {
    for (const mimeType of ['image/heic', 'image/webp']) {
      const res = await as(t, F.participant).post(`${base()}/uploads`, { fileName: 'x', mimeType, sizeBytes: 100, sensitivity: 'SENSITIVE' });
      expect([res.status, code(res), res.body.error?.details?.reason]).toEqual([422, 'FILE_TYPE_NOT_ALLOWED', 'sensitive_image_format']);
    }
    // ordinary (not sensitive) HEIC is still fine
    expect((await as(t, F.participant).post(`${base()}/uploads`, { fileName: 'x.heic', mimeType: 'image/heic', sizeBytes: 100 })).status).toBe(201);
    // starts like a JPEG but is cut off in the middle of a segment
    const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 1, 2, 3]);
    const req = await as(t, F.participant).post(`${base()}/uploads`, { fileName: 'b.jpg', mimeType: 'image/jpeg', sizeBytes: broken.length, sensitivity: 'SENSITIVE' }).expect(201);
    await t.http().put(new URL(req.body.data.upload.url).pathname).set('Content-Type', 'image/jpeg').send(broken).expect(200);
    const done = await as(t, F.participant).post(`${base()}/${req.body.data.file.id}/complete`);
    expect([done.status, done.body.error.details.reason]).toEqual([422, 'image_malformed']);
    expect((await t.prisma.file.findUniqueOrThrow({ where: { id: req.body.data.file.id } })).status).toBe('REJECTED');
  });

  it('removes text and EXIF chunks from PNGs too', async () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('tEXt', [...Buffer.from('Location\0home')]), ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', [])]);
    const f = await uploadFile(t, F.participant, F.orgId, png, 'image/png', 'a.png', 'SENSITIVE');
    const { bytes } = await stored(f.id);
    expect(bytes.toString('latin1')).not.toContain('Location');
    expect(bytes.toString('latin1')).toContain('IDAT');
  });
});
