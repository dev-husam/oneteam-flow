import { Inject, Injectable } from '@nestjs/common';
import { ALLOWED_MIME, canStripMetadata, checkUpload, matchesMime, sanitizeFileName, stripImageMetadata } from '@pt/domain';
import { randomUUID } from 'node:crypto';
import { requestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { TenantPrismaService } from '../../core/tenancy/tenant-prisma.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { FileAccessRegistry } from './file-access.js';
import type { RequestUploadDto } from './files.dto.js';
import { STORAGE, type StorageDriver } from './storage.driver.js';

const HEAD_BYTES = 32;

interface FileRow {
  id: string; originalName: string; mimeType: string; sizeBytes: bigint; sensitivity: string; status: string; rejectReason: string | null; createdAt: Date; uploaderMembershipId: string; storageKey: string;
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(TenantPrismaService) private readonly tenant: TenantPrismaService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(FileAccessRegistry) private readonly access: FileAccessRegistry,
  ) {}

  private dto(f: FileRow) {
    return { id: f.id, name: f.originalName, mimeType: f.mimeType, sizeBytes: Number(f.sizeBytes), sensitivity: f.sensitivity, status: f.status, rejectReason: f.rejectReason, createdAt: f.createdAt, mine: f.uploaderMembershipId === requestContext.tenant().membershipId };
  }

  /** Step 1: validate the declared type and size, create the record, hand out a signed upload URL. */
  async requestUpload(dto: RequestUploadDto) {
    const t = requestContext.tenant();
    const check = checkUpload(dto.mimeType, dto.sizeBytes);
    if (!check.ok) throw new AppError(check.reason === 'too_large' ? 'FILE_TOO_LARGE' : 'FILE_TYPE_NOT_ALLOWED', { reason: check.reason });
    // Sensitive photos must be cleaned of location and camera data, which is only possible for JPEG and PNG.
    if (dto.sensitivity === 'SENSITIVE' && ALLOWED_MIME[dto.mimeType.toLowerCase()] === 'image' && !canStripMetadata(dto.mimeType)) {
      throw new AppError('FILE_TYPE_NOT_ALLOWED', { reason: 'sensitive_image_format' });
    }
    const key = `org/${t.orgId}/files/${randomUUID()}`;
    const file = await this.tenant.db.file.create({
      data: { organizationId: t.orgId, uploaderMembershipId: t.membershipId, storageKey: key, originalName: sanitizeFileName(dto.fileName), mimeType: dto.mimeType.toLowerCase(), sizeBytes: BigInt(dto.sizeBytes), sensitivity: dto.sensitivity ?? 'STANDARD' },
    });
    const upload = await this.storage.presignUpload(key, { contentType: file.mimeType, sizeBytes: dto.sizeBytes });
    return { file: this.dto(file), upload };
  }

  /**
   * Step 2: after uploading, verify what actually arrived: it exists, has the declared size and its first bytes
   * match the declared type. Anything else is deleted and rejected.
   */
  async complete(fileId: string) {
    const t = requestContext.tenant();
    const file = await this.tenant.db.file.findFirst({ where: { id: fileId, uploaderMembershipId: t.membershipId, deletedAt: null } });
    if (!file) throw new AppError('NOT_FOUND');
    if (file.status === 'READY') return this.dto(file);
    if (file.status === 'REJECTED') throw new AppError('FILE_REJECTED', { reason: file.rejectReason });

    const stored = await this.storage.head(file.storageKey);
    if (!stored) throw new AppError('FILE_NOT_UPLOADED');
    const reject = async (reason: string) => {
      await this.storage.delete(file.storageKey);
      await this.tenant.db.file.update({ where: { id: file.id }, data: { status: 'REJECTED', rejectReason: reason } });
      throw new AppError('FILE_REJECTED', { reason });
    };
    if (BigInt(stored.sizeBytes) !== file.sizeBytes) return reject('size_mismatch');
    if (!matchesMime(file.mimeType, await this.storage.readHead(file.storageKey, HEAD_BYTES))) return reject('content_mismatch');

    // Photos leave here without embedded metadata (GPS position, camera, software, comments). A file that is not a
    // well-formed JPEG or PNG is refused rather than stored with unknown contents.
    let sizeBytes = file.sizeBytes;
    if (canStripMetadata(file.mimeType)) {
      const stripped = stripImageMetadata(file.mimeType, await this.storage.read(file.storageKey));
      if (!stripped) return reject('image_malformed');
      if (stripped.removed > 0) {
        await this.storage.write(file.storageKey, stripped.bytes, file.mimeType);
        sizeBytes = BigInt(stripped.bytes.length);
      }
    }
    const ready = await this.tenant.db.file.update({ where: { id: file.id }, data: { status: 'READY', sizeBytes } });
    return this.dto(ready);
  }

  /**
   * Who may read a file: its uploader, or anyone who can see a task it is attached to. Other capabilities
   * (messages, fitness photos) add their own rule here when they arrive.
   */
  private async requireReadable(fileId: string): Promise<FileRow> {
    const t = requestContext.tenant();
    const file = await this.tenant.db.file.findFirst({
      where: { id: fileId, deletedAt: null, OR: [{ uploaderMembershipId: t.membershipId }, { status: 'READY', taskLinks: { some: { task: await this.tasks.visibleWhere() } } }] },
    });
    if (file) return file;
    // Not the uploader's and not on a visible task: a business module may still allow it (e.g. a trainer and a client's photo).
    const candidate = await this.tenant.db.file.findFirst({ where: { id: fileId, deletedAt: null, status: 'READY' } });
    if (candidate && (await this.access.canRead(candidate.id))) return candidate;
    throw new AppError('NOT_FOUND');
  }

  async get(fileId: string) {
    return this.dto(await this.requireReadable(fileId));
  }

  /** Short-lived signed URL, issued only after the policy check. Reads of sensitive files are audited. */
  async downloadUrl(fileId: string) {
    const file = await this.requireReadable(fileId);
    if (file.status !== 'READY') throw new AppError('FILE_NOT_UPLOADED');
    const url = await this.storage.presignDownload(file.storageKey, { fileName: file.originalName, contentType: file.mimeType });
    if (file.sensitivity === 'SENSITIVE') await this.audit.record({ action: 'file.accessed', targetType: 'file', targetId: file.id, metadata: { own: file.uploaderMembershipId === requestContext.tenant().membershipId } });
    return { url, expiresInSeconds: 60 };
  }

  async remove(fileId: string): Promise<void> {
    const t = requestContext.tenant();
    const file = await this.tenant.db.file.findFirst({ where: { id: fileId, uploaderMembershipId: t.membershipId, deletedAt: null } });
    if (!file) throw new AppError('NOT_FOUND');
    await this.tenant.db.file.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
    await this.storage.delete(file.storageKey);
  }
}
