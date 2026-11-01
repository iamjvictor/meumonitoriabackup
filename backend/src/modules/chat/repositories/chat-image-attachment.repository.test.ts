import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatImageAttachmentRepository } from './chat-image-attachment.repository.js';

test('salva a imagem em storage privado e persiste escopo, hash e expiração de até 24h', async () => {
  let uploadedPath = '';
  let saved: any;
  const repo = new ChatImageAttachmentRepository({
    chatImageAttachment: {
      async create(args: any) { saved = args.data; return { id: args.data.id, expiresAt: args.data.expiresAt }; },
      async findFirst() { return null; },
      async findMany() { return []; },
      async delete() { return {}; },
    },
  } as any, {
    async upload(path) { uploadedPath = path; return { error: null }; },
    async download() { return { data: null, error: null }; },
    async remove() { return { error: null }; },
  });
  const createdAt = new Date('2026-10-27T12:00:00Z');
  const bytes = Buffer.from('valid-image-bytes');
  const result = await repo.create({
    studentId: 'student-1', monitorId: 'monitor-1', subjectId: 'subject-1', userId: 'user-1',
    mimeType: 'image/png', width: 100, height: 100, bytes, createdAt,
  });
  assert.equal(saved.studentId, 'student-1');
  assert.equal(saved.monitorId, 'monitor-1');
  assert.equal(saved.subjectId, 'subject-1');
  assert.equal(saved.checksum.length, 64);
  assert.equal(saved.expiresAt.getTime() - createdAt.getTime(), 24 * 60 * 60 * 1000);
  assert.match(uploadedPath, /student-1\/.*\.png$/);
  assert.equal(result.id, saved.id);
});

test('rejeita MIME fora da lista antes de tocar no storage', async () => {
  let uploads = 0;
  const repo = new ChatImageAttachmentRepository({ chatImageAttachment: { async create() {}, async findFirst() { return null; }, async findMany() { return []; }, async delete() {} } } as any, {
    async upload() { uploads += 1; return { error: null }; }, async download() { return { data: null, error: null }; }, async remove() { return { error: null }; },
  });
  await assert.rejects(repo.create({ studentId: 's', monitorId: 'm', subjectId: 'sub', userId: 'u', mimeType: 'application/pdf', width: 10, height: 10, bytes: Buffer.from('x') }), /MIME/);
  assert.equal(uploads, 0);
});

test('carrega bytes apenas para o mesmo escopo e verifica checksum após download', async () => {
  const bytes = Buffer.from('private-image');
  let where: any;
  const repo = new ChatImageAttachmentRepository({
    chatImageAttachment: {
      async create() { return {}; },
      async findFirst(args: any) { where = args.where; return { storagePath: 'private/path', mimeType: 'image/png', sizeBytes: bytes.length, checksum: (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex') }; },
      async findMany() { return []; }, async delete() { return {}; },
    },
  } as any, {
    async upload() { return { error: null }; },
    async download(path) { assert.equal(path, 'private/path'); return { data: new Blob([bytes]), error: null }; },
    async remove() { return { error: null }; },
  });
  const loaded = await repo.loadAuthorizedImage({ attachmentId: 'asset-1', userId: 'user-1', studentId: 'student-1', monitorId: 'monitor-1', subjectId: 'subject-1' });
  assert.equal(loaded?.bytes.toString(), bytes.toString());
  assert.equal(where.userId, 'user-1');
  assert.equal(where.studentId, 'student-1');
  assert.equal(where.monitorId, 'monitor-1');
  assert.equal(where.subjectId, 'subject-1');
  assert.ok(where.expiresAt.gt instanceof Date);
});

test('não remove a linha expirada se a remoção do objeto privado falha', async () => {
  let deleted = 0;
  const repo = new ChatImageAttachmentRepository({
    chatImageAttachment: {
      async create() { return {}; }, async findFirst() { return null; },
      async findMany() { return [{ id: 'expired-1', storagePath: 'private/path' }]; },
      async delete() { deleted += 1; return {}; },
    },
  } as any, { async upload() { return { error: null }; }, async download() { return { data: null, error: null }; }, async remove() { return { error: new Error('storage down') }; } });
  assert.deepEqual(await repo.deleteExpiredBatch(new Date()), { selected: 1, deleted: 0 });
  assert.equal(deleted, 0);
});

test('retry do mesmo upload no mesmo escopo reutiliza o anexo sem enviar bytes outra vez', async () => {
  const bytes = Buffer.from('same-image');
  let uploadCount = 0;
  let saved: any;
  const repo = new ChatImageAttachmentRepository({
    chatImageAttachment: {
      async create(args: any) { saved = { id: args.data.id, expiresAt: args.data.expiresAt, checksum: args.data.checksum, mimeType: args.data.mimeType, sizeBytes: args.data.sizeBytes, width: args.data.width, height: args.data.height }; return saved; },
      async findFirst(args: any) { return args.where.checksum === saved?.checksum ? saved : null; },
      async findMany() { return []; }, async delete() { return {}; },
    },
  } as any, {
    async upload() { uploadCount += 1; return { error: null }; }, async download() { return { data: null, error: null }; }, async remove() { return { error: null }; },
  });
  const input = { userId: 'u', studentId: 's', monitorId: 'm', subjectId: 'sub', mimeType: 'image/png', width: 10, height: 10, bytes, createdAt: new Date() };
  const first = await repo.create(input);
  const second = await repo.create(input);
  assert.equal(second.id, first.id);
  assert.equal(uploadCount, 1);
});
