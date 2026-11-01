import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeChatImageUpload, validateChatImageUpload } from './chat-image-upload.service.js';

test('aceita imagem real PNG e retorna dimensões verificadas', async () => {
  const realPng = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#2e5b37' } }).png().toBuffer();
  const result = await validateChatImageUpload({
    mimeType: 'image/png', bytes: realPng,
    inspect: async (bytes) => sharp(bytes, { failOn: 'error' }).metadata(),
  });
  assert.deepEqual(result, { mimeType: 'image/png', width: 320, height: 240 });
});

test('rejeita MIME falso, dimensões acima do limite e payload acima de 5 MiB', async () => {
  await assert.rejects(validateChatImageUpload({ mimeType: 'image/png', bytes: Buffer.from('not-png'), inspect: async () => ({ format: 'jpeg', width: 10, height: 10 }) }), /CONTENT_MISMATCH/);
  await assert.rejects(validateChatImageUpload({ mimeType: 'image/webp', bytes: Buffer.from('webp'), inspect: async () => ({ format: 'webp', width: 4097, height: 1 }) }), /DIMENSIONS/);
  await assert.rejects(validateChatImageUpload({ mimeType: 'image/png', bytes: Buffer.alloc(5 * 1024 * 1024 + 1), inspect: async () => ({ format: 'png', width: 1, height: 1 }) }), /SIZE/);
});

test('normaliza foto e remove metadados EXIF antes do armazenamento', async () => {
  const source = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#1d527d' } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: 'sensitive-camera-metadata' } } }).toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const normalized = await normalizeChatImageUpload({ mimeType: 'image/jpeg', bytes: source });
  const metadata = await sharp(normalized.bytes).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 12);
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
});
