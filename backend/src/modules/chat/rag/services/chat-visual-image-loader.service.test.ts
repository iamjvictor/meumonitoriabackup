import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ChatVisualImageLoader } from './chat-visual-image-loader.service.js';

test('carrega bytes privados após conferir o escopo e o checksum do upload', async () => {
  const bytes = Buffer.from('private-png-bytes');
  let where: any;
  const loader = new ChatVisualImageLoader({
    chatImageAttachment: { async findFirst(args: any) { where = args.where; return { storagePath: 'private/upload', mimeType: 'image/png', checksum: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length }; } },
    documentVisualAsset: { async findFirst() { return null; } },
  } as any, {
    async download(path) { assert.equal(path, 'private/upload'); return { data: new Blob([bytes]), error: null }; },
  }, { async download() { return { data: null, error: null }; } });
  const result = await loader.load([{ assetId: 'upload-1', page: null, checksum: 'hash', description: null, source: 'STUDENT_UPLOAD' }], {
    studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1',
  });
  assert.match(result.images[0]?.dataUrl ?? '', /^data:image\/png;base64,/);
  assert.equal(result.images[0]?.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.omittedCount, 0);
  assert.equal(where.studentId, 'student-1');
  assert.equal(where.monitorId, 'monitor-1');
  assert.equal(where.subjectId, 'subject-1');
  assert.ok(where.expiresAt.gt instanceof Date);
});

test('omite imagem expirada ou adulterada sem incluir bytes no payload', async () => {
  const loader = new ChatVisualImageLoader({
    chatImageAttachment: { async findFirst() { return null; } },
    documentVisualAsset: { async findFirst() { return null; } },
  } as any, { async download() { throw new Error('must not download'); } }, { async download() { throw new Error('must not download'); } });
  const result = await loader.load([{ assetId: 'expired-1', page: null, checksum: 'x', description: null, source: 'STUDENT_UPLOAD' }], {
    studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1',
  });
  assert.deepEqual(result.images, []);
  assert.equal(result.omittedCount, 1);
});

test('carrega figura do documento somente no monitor e matéria autorizados', async () => {
  const bytes = Buffer.from('doc-figure');
  let where: any;
  const loader = new ChatVisualImageLoader({
    chatImageAttachment: { async findFirst() { return null; } },
    documentVisualAsset: { async findFirst(args: any) { where = args.where; return { storagePath: 'doc/private.png', mimeType: 'image/png', checksum: createHash('sha256').update(bytes).digest('hex') }; } },
  } as any, { async download() { return { data: null, error: null }; } }, {
    async download(path) { assert.equal(path, 'doc/private.png'); return { data: new Blob([bytes]), error: null }; },
  });
  const result = await loader.load([{ assetId: 'figure-1', page: 3, checksum: 'original-checksum', description: 'Gráfico', source: 'QUESTION' }], {
    studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1',
  });
  assert.equal(result.images.length, 1);
  assert.equal(where.document.teacherId, 'teacher-1');
  assert.equal(where.document.monitorId, 'monitor-1');
  assert.equal(where.document.subjectId, 'subject-1');
});
