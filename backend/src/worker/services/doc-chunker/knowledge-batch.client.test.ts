import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { KnowledgeBatchClient, LONG_LIVED_PARSER_DISPATCHER_OPTIONS } from './knowledge-batch.client.js';

const documentId = 'b66c921e-20c9-4fc1-81da-a24b7f5e98fa';
const runId = 'cf16a4ef-9f82-4701-8890-8bc39c8077ee';
const bytes = Buffer.from('%PDF-test');
const contentHash = sha(bytes);
const configurationHash = 'a'.repeat(64);

function responseFor(pages: unknown[], pageStart = 1, pageEnd = 2, schemaVersion = 'knowledge-batch-v1') {
  const files = [{ path: 'batch.json', sha256: sha(Buffer.from('{}')), contentBase64: Buffer.from('{}').toString('base64') }];
  const packaged = Buffer.from(JSON.stringify(files.map((file) => ({ ...file }))));
  const body = Buffer.from(JSON.stringify({
    manifest: { schemaVersion, documentId, runId, contentHash, configurationHash, parserVersion: '2.122.0', pageStart, pageEnd, pages, files },
    artifactChecksum: sha(packaged), durationMs: 123,
  }));
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/vnd.knowledge-batch.v1+json', 'X-Request-Id': 'request-1' } });
}

function client(fetchImpl: typeof fetch) {
  return new KnowledgeBatchClient({ baseUrl: 'http://parser.test', serviceToken: 'secret', requestTimeoutMs: 1000, fetchImpl, requestIdFactory: () => 'request-1' });
}

function page(pageNumber: number) {
  return { pageNumber, status: 'CONVERTED', characterCount: 10, layoutItemCount: 1, imageCount: 0, errors: [] };
}

test('accepts only complete page coverage and checksummed artifact files', async () => {
  const result = await client(async () => responseFor([page(1), page(2)])).convert({
    documentId, runId, contentHash, configurationHash, pageStart: 1, pageEnd: 2,
    profile: {}, fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: bytes,
  });
  assert.equal(result.manifest.pages.length, 2);
  assert.equal(result.durationMs, 123);
});

test('rejects missing page coverage instead of treating partial output as a checkpoint', async () => {
  await assert.rejects(client(async () => responseFor([page(1)])).convert({
    documentId, runId, contentHash, configurationHash, pageStart: 1, pageEnd: 2,
    profile: {}, fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: bytes,
  }), /contabilizou todas as páginas/);
});

test('rejects an unsupported manifest schema before checkpointing', async () => {
  await assert.rejects(client(async () => responseFor([page(1), page(2)], 1, 2, 'future-schema')).convert({
    documentId, runId, contentHash, configurationHash, pageStart: 1, pageEnd: 2,
    profile: {}, fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: bytes,
  }), /versão do manifest/);
});

test('uses an unbounded Undici dispatcher while enforcing the explicit request deadline and destroys it on timeout', async () => {
  let dispatcherOptions: unknown;
  let destroyed = 0;
  const parserClient = new KnowledgeBatchClient({
    baseUrl: 'http://parser.test', serviceToken: 'secret', requestTimeoutMs: 10,
    requestIdFactory: () => 'request-1',
    createDispatcher(options) {
      dispatcherOptions = options;
      return { async close() {}, async destroy() { destroyed += 1; } } as never;
    },
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }),
  });

  await assert.rejects(parserClient.convert({
    documentId, runId, contentHash, configurationHash, pageStart: 1, pageEnd: 2,
    profile: {}, fileName: 'book.pdf', mimeType: 'application/pdf', fileBytes: bytes,
  }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'PARSER_TIMEOUT_OR_ABORT');
    return true;
  });
  assert.deepEqual(dispatcherOptions, { headersTimeout: 0, bodyTimeout: 0, connectTimeout: 0 });
  assert.deepEqual(LONG_LIVED_PARSER_DISPATCHER_OPTIONS, dispatcherOptions);
  assert.equal(destroyed, 1);
});

function sha(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
