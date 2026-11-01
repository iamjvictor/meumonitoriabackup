import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import { DocChunkerV2Client, DocChunkerV2ClientError } from '../doc-chunker-v2.client.js';

const requestId = 'b3615f67-b6df-47e1-90b7-7e5d8de13e4f';
const docHash = createHash('sha256').update('pdf').digest('hex');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const manifest = {
  schema_version: 'doc-chunker/v2', request_id: requestId, doc_hash: docHash,
  parser_version: '2.122.0', tokenizer_id: 'test-tokenizer', chunker_version: 'hybrid-v1', page_count: 1,
  engine: 'docling', chunks: [{ index: 0, text: 'Figura', raw_text: 'Figura', headings: [], pages: [1], type: 'text', tokens: 1, provenance: [] }],
  visual_assets: [{ asset_key: '1'.repeat(32), source_item_ref: '#/pictures/0', reading_order: 0, page_number: 1,
    bbox: [1, 2, 30, 40], coord_origin: 'TOPLEFT', caption: 'Figura', mime_type: 'image/png',
    width: 1, height: 1, sha256: createHash('sha256').update(png).digest('hex') }],
  warnings: [],
};

function zip(files: Array<[string, Buffer]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(local, 30);
    locals.push(local, compressed);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46); centrals.push(central); offset += local.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralDir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const validZip = () => zip([
  ['manifest.json', Buffer.from(JSON.stringify(manifest))],
  [`assets/${'1'.repeat(32)}.png`, png],
]);

function clientFor(body: Buffer, options: { hash?: string; maxResponseBytes?: number } = {}) {
  return new DocChunkerV2Client({
    baseUrl: 'http://parser.internal', requestIdFactory: () => requestId,
    maxResponseBytes: options.maxResponseBytes,
    fetchImpl: async (_url, init) => {
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['X-Expected-SHA256'], options.hash ?? docHash);
      return new Response(new Blob([body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer]), { status: 200, headers: {
        'Content-Type': 'application/vnd.doc-chunker.v2+zip', 'X-Request-Id': requestId,
      } });
    },
  });
}

const input = (hash = docHash) => ({
  documentId: randomUUID(), expectedSha256: hash, fileName: 'source.pdf', mimeType: 'application/pdf', fileBytes: Buffer.from('pdf'), requestId,
});

test('v2 decodes package and verifies asset bytes against manifest hashes', async () => {
  const response = await clientFor(validZip()).chunkWithAssets(input());
  assert.equal(response.docHash, docHash);
  assert.equal(response.chunks.length, 1);
  assert.equal(response.assets[0]!.sourceItemRef, '#/pictures/0');
  assert.deepEqual(response.assets[0]!.content, png);
});

test('v2 rejects a document hash mismatch before transport', async () => {
  await assert.rejects(clientFor(validZip()).chunkWithAssets(input('b'.repeat(64))),
    (error: unknown) => error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_HASH_MISMATCH');
});

test('v2 rejects path traversal in ZIP entries', async () => {
  const body = zip([['manifest.json', Buffer.from(JSON.stringify(manifest))], ['../evil.png', png]]);
  await assert.rejects(clientFor(body).chunkWithAssets(input()),
    (error: unknown) => error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_INVALID_PACKAGE');
});

test('v2 rejects expanded packages over the configured response limit', async () => {
  const expandedImage = Buffer.concat([png, Buffer.alloc(8192, 0)]);
  const expandedManifest = { ...manifest, visual_assets: [{
    ...manifest.visual_assets[0], sha256: createHash('sha256').update(expandedImage).digest('hex'),
  }] };
  const compressedPackage = zip([
    ['manifest.json', Buffer.from(JSON.stringify(expandedManifest))],
    [`assets/${'1'.repeat(32)}.png`, expandedImage],
  ]);
  assert.ok(compressedPackage.length < 2048);
  await assert.rejects(clientFor(compressedPackage, { maxResponseBytes: 2048 }).chunkWithAssets(input()),
    (error: unknown) => error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_RESPONSE_TOO_LARGE');
});

test('v2 rejects visual bytes whose SHA-256 differs from the manifest', async () => {
  const invalidManifest = { ...manifest, visual_assets: [{ ...manifest.visual_assets[0], sha256: '0'.repeat(64) }] };
  const body = zip([['manifest.json', Buffer.from(JSON.stringify(invalidManifest))], [`assets/${'1'.repeat(32)}.png`, png]]);
  await assert.rejects(clientFor(body).chunkWithAssets(input()),
    (error: unknown) => error instanceof DocChunkerV2ClientError && error.code === 'DOC_CHUNKER_ASSET_HASH_MISMATCH');
});
