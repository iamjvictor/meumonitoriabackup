import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { DocChunkerV2Client, DocChunkerV2ClientError } from '../doc-chunker-v2.client.js';

const requestId = 'b3615f67-b6df-47e1-90b7-7e5d8de13e4f';
const bytes = Buffer.from('%PDF-1.4 synthetic queue fixture');
const hash = createHash('sha256').update(bytes).digest('hex');

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPackage(expectedRequestId = requestId): Buffer {
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 'doc-chunker/v2', request_id: expectedRequestId, doc_hash: hash,
    parser_version: '2.122.0', tokenizer_id: 'qa-tokenizer', chunker_version: 'qa-v1',
    engine: 'docling', page_count: 1,
    chunks: [{ index: 0, text: 'fila', raw_text: 'fila', headings: [], pages: [1], type: 'text', tokens: 1, provenance: [] }],
    visual_assets: [], warnings: [],
  }));
  const name = Buffer.from('manifest.json');
  const compressed = deflateRawSync(manifest);
  const crc = crc32(manifest);

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(manifest.length, 22);
  local.writeUInt16LE(name.length, 26); name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(manifest.length, 24); central.writeUInt16LE(name.length, 28); name.copy(central, 46);

  const directory = Buffer.concat([central]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, directory, end]);
}

function v2Response(body: Buffer, id = requestId): Response {
  const responseBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new Response(responseBody, { status: 200, headers: {
    'Content-Type': 'application/vnd.doc-chunker.v2+zip', 'X-Request-Id': id,
  } });
}

function client(fetchImpl: typeof fetch, requestTimeoutMs = 600_000): DocChunkerV2Client {
  return new DocChunkerV2Client({
    baseUrl: 'http://parser.test', requestTimeoutMs,
    requestIdFactory: () => requestId,
    fetchImpl,
  });
}

const input = () => ({
  documentId: 'doc-qa', expectedSha256: hash, fileName: 'queue.pdf', mimeType: 'application/pdf',
  fileBytes: bytes, requestId,
});

test('keeps the request open beyond 600 seconds and accepts the complete response package', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseResponse!: () => void;
  let settled = false;
  const fetchImpl: typeof fetch = async () => {
    await new Promise<void>((resolve) => { releaseResponse = resolve; });
    return v2Response(validPackage());
  };

  const resultPromise = client(fetchImpl, 700_000).chunkWithAssets(input());
  void resultPromise.finally(() => { settled = true; }).catch(() => undefined);
  await Promise.resolve();
  t.mock.timers.tick(600_001);
  await Promise.resolve();

  assert.equal(settled, false, 'a 600-second fixed timeout must not terminate a configured 700-second request');
  releaseResponse();
  const result = await resultPromise;
  assert.equal(result.docHash, hash);
  assert.equal(result.chunks[0]?.text, 'fila');
  t.mock.timers.reset();
});

test('preserves the original transport error instead of reporting an invalid ZIP', async () => {
  const socketFailure = Object.assign(new Error('socket hang up'), { code: 'UND_ERR_SOCKET' });
  const fetchFailure = new TypeError('fetch failed', { cause: socketFailure });
  const instance = client(async () => { throw fetchFailure; });

  await assert.rejects(instance.chunkWithAssets(input()), (error: unknown) => {
    assert.ok(error instanceof DocChunkerV2ClientError);
    assert.equal(error.code, 'DOC_CHUNKER_NETWORK_ERROR');
    assert.equal(error.cause, fetchFailure);
    return true;
  });
});

test('reports a configured request timeout distinctly when the transport aborts', async () => {
  const instance = client((_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  }), 10);

  await assert.rejects(instance.chunkWithAssets(input()), (error: unknown) =>
    error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_TIMEOUT');
});

test('keeps an invalid package failure distinct from transport failures', async () => {
  const instance = client(async () => v2Response(Buffer.from('not a zip')));

  await assert.rejects(instance.chunkWithAssets(input()), (error: unknown) =>
    error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_INVALID_PACKAGE');
});
