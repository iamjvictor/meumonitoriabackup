import { CHAT_IMAGE_MAX_BYTES } from '../repositories/chat-image-attachment.repository.js';
import sharp from 'sharp';

const EXPECTED_FORMAT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

export async function validateChatImageUpload(input: {
  mimeType: string;
  bytes: Buffer;
  inspect: (bytes: Buffer) => Promise<{ format?: string; width?: number; height?: number }>;
}) {
  if (!(input.mimeType in EXPECTED_FORMAT)) throw new Error('CHAT_IMAGE_MIME_NOT_ALLOWED');
  if (input.bytes.length === 0 || input.bytes.length > CHAT_IMAGE_MAX_BYTES) throw new Error('CHAT_IMAGE_SIZE_INVALID');
  let metadata: { format?: string; width?: number; height?: number };
  try {
    metadata = await input.inspect(input.bytes);
  } catch {
    throw new Error('CHAT_IMAGE_CONTENT_INVALID');
  }
  if (metadata.format !== EXPECTED_FORMAT[input.mimeType]) throw new Error('CHAT_IMAGE_CONTENT_MISMATCH');
  const { width, height } = metadata;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !width || !height || width > 4096 || height > 4096) {
    throw new Error('CHAT_IMAGE_DIMENSIONS_INVALID');
  }
  return { mimeType: input.mimeType, width, height };
}

export async function normalizeChatImageUpload(input: { mimeType: string; bytes: Buffer }) {
  const validated = await validateChatImageUpload({
    ...input,
    inspect: async (bytes) => sharp(bytes, { failOn: 'error', limitInputPixels: 4096 * 4096 }).metadata(),
  });
  const pipeline = sharp(input.bytes, { failOn: 'error', limitInputPixels: 4096 * 4096 }).rotate();
  if (input.mimeType === 'image/png') pipeline.png();
  else if (input.mimeType === 'image/jpeg') pipeline.jpeg({ quality: 90 });
  else pipeline.webp({ quality: 90 });
  const bytes = await pipeline.toBuffer();
  if (bytes.length > CHAT_IMAGE_MAX_BYTES) throw new Error('CHAT_IMAGE_SIZE_INVALID');
  return { ...validated, bytes };
}
