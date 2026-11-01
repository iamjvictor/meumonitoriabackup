import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DocChunkerClient, DocChunkerClientError } from '../doc-chunker.client.js';

const bytes = Buffer.from('%PDF-1.4 fixture');
const hash = createHash('sha256').update(bytes).digest('hex');
const requestId = 'b3615f67-b6df-47e1-90b7-7e5d8de13e4f';
const validBody = {
  schema_version: 'doc-chunker/v1', request_id: requestId, status: 'completed',
  doc_hash: hash, engine: 'docling', parser_version: '2.122.0',
  tokenizer_id: 'Qwen/Qwen3-Embedding-8B', chunker_version: 'hybrid-v1',
  page_count: 1,
  chunks: [{ index: 0, text: 'Contexto textual', raw_text: 'Texto', headings: [], pages: [1], type: 'text', tokens: 2, provenance: [] }],
};

function clientFor(response: Response) {
  return new DocChunkerClient({
    baseUrl: 'http://parser.internal', fetchImpl: async () => response,
    requestIdFactory: () => requestId,
  });
}

async function request(client: DocChunkerClient) {
  return client.chunk({ documentId: 'document-1', expectedSha256: hash, fileName: 'aula.pdf', mimeType: 'application/pdf', fileBytes: bytes });
}

test('accepts a complete response whose hash and correlation id match the request', async () => {
  const response = new Response(JSON.stringify(validBody), { status: 200, headers: { 'X-Request-Id': requestId } });
  const result = await request(clientFor(response));
  assert.equal(result.request_id, requestId);
});

test('rejects HTTP 200 with truncated JSON as invalid response', async () => {
  const response = new Response('{"status":"completed"', { status: 200, headers: { 'X-Request-Id': requestId } });
  await assert.rejects(request(clientFor(response)), (error: unknown) => error instanceof DocChunkerClientError && error.code === 'DOC_CHUNKER_INVALID_JSON');
});

test('rejects JSON outside the versioned response contract', async () => {
  const response = new Response(JSON.stringify({ ...validBody, schema_version: 'doc-chunker/v9' }), { status: 200, headers: { 'X-Request-Id': requestId } });
  await assert.rejects(request(clientFor(response)), (error: unknown) => error instanceof DocChunkerClientError && error.code === 'DOC_CHUNKER_INVALID_CONTRACT');
});

test('rejects HTTP 200 with no chunks so an empty knowledge base cannot be marked ready', async () => {
  const response = new Response(JSON.stringify({ ...validBody, chunks: [] }), {
    status: 200, headers: { 'X-Request-Id': requestId },
  });
  await assert.rejects(request(clientFor(response)), (error: unknown) =>
    error instanceof DocChunkerClientError && error.code === 'DOC_CHUNKER_INVALID_CONTRACT');
});

test('rejects a response for a different PDF hash', async () => {
  const response = new Response(JSON.stringify({ ...validBody, doc_hash: 'f'.repeat(64) }), { status: 200, headers: { 'X-Request-Id': requestId } });
  await assert.rejects(request(clientFor(response)), (error: unknown) => error instanceof DocChunkerClientError && error.code === 'DOC_CHUNKER_HASH_MISMATCH');
});

test('rejects a response with a different correlation id header', async () => {
  const response = new Response(JSON.stringify(validBody), { status: 200, headers: { 'X-Request-Id': 'other-request' } });
  await assert.rejects(request(clientFor(response)), (error: unknown) => error instanceof DocChunkerClientError && error.code === 'DOC_CHUNKER_REQUEST_ID_MISMATCH');
});

test('applies the request timeout through response body consumption', async () => {
  const response = new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200, headers: { 'X-Request-Id': requestId } });
  const client = new DocChunkerClient({ baseUrl: 'http://parser.internal', fetchImpl: async () => response, requestIdFactory: () => requestId, requestTimeoutMs: 10 });
  const outcome = await Promise.race([
    request(client).then(() => 'resolved', (error: unknown) => error),
    new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 100)),
  ]);
  assert.ok(outcome instanceof DocChunkerClientError);
  assert.equal(outcome.code, 'DOC_CHUNKER_TIMEOUT');
});

test('structured request logs do not include filenames or response text', async () => {
  const logs: Array<Record<string, unknown>> = [];
  const response = new Response(JSON.stringify(validBody), { status: 200, headers: { 'X-Request-Id': requestId } });
  const client = new DocChunkerClient({
    baseUrl: 'http://parser.internal', fetchImpl: async () => response,
    requestIdFactory: () => requestId, logger: (_event, payload) => logs.push(payload),
  });
  await request(client);
  const serializedLogs = JSON.stringify(logs);
  assert.doesNotMatch(serializedLogs, /aula\.pdf|Contexto textual|Texto/);
  assert.match(serializedLogs, /request_id/);
  assert.match(serializedLogs, /doc_hash/);
});
