import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type EmailPayload = { from: string; to: string | string[]; subject: string; html: string; text?: string };

export class EmailOutboxCipher {
  private readonly key: Buffer;
  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32 || key.toString('base64') !== base64Key) throw new Error('Email outbox encryption key must be Base64 for exactly 32 bytes');
    this.key = key;
  }
  encrypt(value: EmailPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
  }
  decrypt(value: string): EmailPayload {
    const [version, iv, tag, ciphertext] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported encrypted email payload');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const clear = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(clear) as EmailPayload;
  }
}

export function hashEmailRecipient(recipient: string): string {
  return createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex');
}
