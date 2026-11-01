import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma.js';
import { supabaseAdmin } from '../../../lib/supabase.js';

export const CHAT_IMAGE_BUCKET = 'chat-attachments';
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type ChatImageInput = {
  userId: string;
  studentId: string;
  monitorId: string;
  subjectId: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: Buffer;
  createdAt?: Date;
};

type Database = {
  chatImageAttachment: {
    create(args: any): Promise<any>;
    findFirst(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    delete(args: any): Promise<any>;
  };
};
type Storage = {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown | null }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
};

export class ChatImageAttachmentRepository {
  constructor(
    private readonly database: Database = prisma as unknown as Database,
    private readonly storage: Storage = supabaseAdmin.storage.from(CHAT_IMAGE_BUCKET) as unknown as Storage,
  ) {}

  async create(input: ChatImageInput) {
    validateInput(input);
    const createdAt = input.createdAt ?? new Date();
    const checksum = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await this.database.chatImageAttachment.findFirst({
      where: {
        userId: input.userId, studentId: input.studentId, monitorId: input.monitorId, subjectId: input.subjectId,
        checksum, expiresAt: { gt: createdAt },
      },
      select: { id: true, expiresAt: true, checksum: true, mimeType: true, sizeBytes: true, width: true, height: true },
    });
    if (existing) return existing;

    const id = randomUUID();
    const extension = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType.slice('image/'.length);
    const storagePath = `${input.studentId}/${input.monitorId}/${input.subjectId}/${id}.${extension}`;
    const uploaded = await this.storage.upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
    if (uploaded.error) throw new Error('CHAT_IMAGE_STORAGE_UPLOAD_FAILED');
    try {
      const row = await this.database.chatImageAttachment.create({ data: {
        id, userId: input.userId, studentId: input.studentId, monitorId: input.monitorId, subjectId: input.subjectId,
        storagePath, mimeType: input.mimeType, sizeBytes: input.bytes.length, width: input.width, height: input.height,
        checksum, createdAt, expiresAt: new Date(createdAt.getTime() + CHAT_IMAGE_TTL_MS),
      }, select: { id: true, expiresAt: true } });
      return { ...row, checksum, mimeType: input.mimeType, sizeBytes: input.bytes.length, width: input.width, height: input.height };
    } catch (error) {
      await this.storage.remove([storagePath]).catch(() => undefined);
      throw error;
    }
  }

  async findAuthorized(input: { attachmentId: string; userId: string; studentId: string; monitorId: string; subjectId: string; now?: Date }) {
    return this.database.chatImageAttachment.findFirst({
      where: {
        id: input.attachmentId, userId: input.userId, studentId: input.studentId,
        monitorId: input.monitorId, subjectId: input.subjectId, expiresAt: { gt: input.now ?? new Date() },
      },
      select: { id: true, storagePath: true, mimeType: true, checksum: true, sizeBytes: true, width: true, height: true, expiresAt: true },
    });
  }

  async loadAuthorizedImage(input: { attachmentId: string; userId: string; studentId: string; monitorId: string; subjectId: string; now?: Date }) {
    const attachment = await this.findAuthorized(input);
    if (!attachment) return null;
    const downloaded = await this.storage.download(attachment.storagePath);
    if (downloaded.error || !downloaded.data) return null;
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    if (bytes.length !== attachment.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== attachment.checksum) {
      throw new Error('CHAT_IMAGE_CHECKSUM_MISMATCH');
    }
    return { attachment, bytes };
  }

  async deleteExpiredBatch(now = new Date(), limit = 100) {
    const rows = await this.database.chatImageAttachment.findMany({
      where: { expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' }, take: limit,
      select: { id: true, storagePath: true },
    });
    let deleted = 0;
    for (const row of rows) {
      const removed = await this.storage.remove([row.storagePath]);
      if (removed.error) continue;
      await this.database.chatImageAttachment.delete({ where: { id: row.id } });
      deleted += 1;
    }
    return { selected: rows.length, deleted };
  }
}

function validateInput(input: ChatImageInput) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new Error('CHAT_IMAGE_MIME_NOT_ALLOWED');
  if (input.bytes.length === 0 || input.bytes.length > CHAT_IMAGE_MAX_BYTES) throw new Error('CHAT_IMAGE_SIZE_INVALID');
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.width > 4096 || input.height > 4096) {
    throw new Error('CHAT_IMAGE_DIMENSIONS_INVALID');
  }
}
