import assert from 'node:assert/strict';
import test from 'node:test';

test('knowledge upload saves the subject without a topic link or undefined storage folder', async (t) => {
  let storagePath = '';
  let savedData: Record<string, unknown> | undefined;
  let scopeWhere: Record<string, unknown> | undefined;

  await t.mock.module('../../lib/prisma.js', {
    namedExports: {
      prisma: {
        monitor: {
          async findFirst({ where }: { where: Record<string, unknown> }) {
            scopeWhere = where;
            return { id: 'monitor-1', teacherId: 'teacher-1' };
          },
        },
        monitorDocument: {
          async create({ data }: { data: Record<string, unknown> }) {
            savedData = data;
            return { ...data, id: data.id };
          },
        },
      },
    },
  });
  await t.mock.module('../../lib/supabase.js', {
    namedExports: {
      supabaseAdmin: {
        storage: {
          from() {
            return {
              async upload(path: string) {
                storagePath = path;
                return { error: null };
              },
              async remove() { return { error: null }; },
            };
          },
        },
      },
    },
  });
  await t.mock.module('../../services/pdf-compression.service.js', {
    namedExports: {
      STORAGE_FILE_LIMIT_BYTES: 50_000_000,
      async compressPdfForStorage({ buffer }: { buffer: Buffer }) {
        return { buffer, finalSizeBytes: buffer.length, originalSizeBytes: buffer.length, compressed: false, profile: 'none', localDiagnosticPath: null };
      },
    },
  });
  await t.mock.module('../document-processing-job.repository.js', {
    namedExports: { DOCUMENT_PROCESSING_VERSION: 4, async ensureDocumentProcessingJobs() {} },
  });

  const { DocumentRepository } = await import('../document.repository.js');
  const result = await new DocumentRepository().save(
    'user-1',
    'monitor-1',
    { subjectId: 'subject-1', tag: 'knowledge' },
    { buffer: Buffer.from('PDF'), originalName: 'matematica.pdf', mimeType: 'application/pdf', sizeBytes: 3 },
  );

  assert.equal(result.kind, 'CREATED');
  assert.equal(savedData?.subjectId, 'subject-1');
  assert.equal(savedData?.topicId, null);
  assert.equal('topicLinks' in (savedData ?? {}), false);
  assert.match(storagePath, /\/subject-1\/whole-subject\//);
  assert.doesNotMatch(storagePath, /undefined/);
  assert.deepEqual((scopeWhere?.subjects as { some: unknown }).some, { id: 'subject-1' });
});
