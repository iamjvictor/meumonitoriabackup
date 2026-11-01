import { createHash } from 'node:crypto';
import { prisma } from '../../../../lib/prisma.js';
import { supabaseAdmin } from '../../../../lib/supabase.js';
import { CHAT_IMAGE_BUCKET } from '../../repositories/chat-image-attachment.repository.js';
import type { ChatVisualContextImage } from './chat-visual-context.service.js';

const DOCUMENT_BUCKET = 'document-parser-artifacts';
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

type Scope = { studentId?: string; teacherId?: string; monitorId: string; subjectId: string };
type Metadata = { storagePath: string; mimeType: string; checksum: string; sizeBytes?: number };
type Database = {
  chatImageAttachment: { findFirst(args: unknown): Promise<Metadata | null> };
  documentVisualAsset: { findFirst(args: unknown): Promise<Metadata | null> };
};
type Storage = { download(path: string): Promise<{ data: Blob | null; error: unknown | null }> };

export class ChatVisualImageLoader {
  constructor(
    private readonly database: Database = prisma as unknown as Database,
    private readonly studentStorage: Storage = supabaseAdmin.storage.from(CHAT_IMAGE_BUCKET) as unknown as Storage,
    private readonly documentStorage: Storage = supabaseAdmin.storage.from(DOCUMENT_BUCKET) as unknown as Storage,
  ) {}

  async load(images: ChatVisualContextImage[], scope: Scope) {
    const loaded: Array<{ assetId: string; sha256: string; dataUrl: string }> = [];
    let omittedCount = 0;
    let totalBytes = 0;
    for (const image of images.slice(0, 4)) {
      try {
        if (!scope.studentId || !scope.teacherId) throw new Error('CHAT_IMAGE_SCOPE_MISSING');
        const studentUpload = image.source === 'STUDENT_UPLOAD';
        const row = studentUpload
          ? await this.database.chatImageAttachment.findFirst({
            where: { id: image.assetId, studentId: scope.studentId, monitorId: scope.monitorId, subjectId: scope.subjectId, expiresAt: { gt: new Date() } },
            select: { storagePath: true, mimeType: true, checksum: true, sizeBytes: true },
          })
          : await this.database.documentVisualAsset.findFirst({
            where: { id: image.assetId, document: { teacherId: scope.teacherId, monitorId: scope.monitorId, subjectId: scope.subjectId } },
            select: { storagePath: true, mimeType: true, checksum: true },
          });
        if (!row || !row.checksum || !isAllowedImageMime(row.mimeType)) throw new Error('CHAT_IMAGE_NOT_AUTHORIZED');
        if (row.sizeBytes && (row.sizeBytes > MAX_TOTAL_BYTES || totalBytes + row.sizeBytes > MAX_TOTAL_BYTES)) throw new Error('CHAT_IMAGE_PAYLOAD_LIMIT');
        const storage = studentUpload ? this.studentStorage : this.documentStorage;
        const downloaded = await storage.download(row.storagePath);
        if (downloaded.error || !downloaded.data) throw new Error('CHAT_IMAGE_DOWNLOAD_FAILED');
        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (bytes.length > MAX_TOTAL_BYTES || totalBytes + bytes.length > MAX_TOTAL_BYTES
            || (row.sizeBytes !== undefined && bytes.length !== row.sizeBytes)
            || sha256 !== row.checksum) {
          throw new Error('CHAT_IMAGE_INTEGRITY_OR_SIZE_FAILED');
        }
        totalBytes += bytes.length;
        loaded.push({ assetId: image.assetId, sha256, dataUrl: `data:${row.mimeType};base64,${bytes.toString('base64')}` });
      } catch (error) {
        omittedCount += 1;
        console.warn('Imagem visual omitida do payload multimodal', {
          event: 'chat.visual_image_omitted', assetId: image.assetId,
          source: image.source, reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        });
      }
    }
    omittedCount += Math.max(0, images.length - 4);
    return { images: loaded, omittedCount, totalBytes };
  }
}

function isAllowedImageMime(value: string | null | undefined): value is 'image/png' | 'image/jpeg' | 'image/webp' {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}
