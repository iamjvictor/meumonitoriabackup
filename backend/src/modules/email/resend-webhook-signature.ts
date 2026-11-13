import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export type ResendWebhookSignatureHeaders = {
  id?: string;
  timestamp?: string;
  signature?: string;
};

export function verifyResendWebhookSignature(input: {
  payload: string;
  headers: ResendWebhookSignatureHeaders;
  webhookSecret: string;
  now?: Date;
  toleranceSeconds?: number;
}) {
  const id = input.headers.id?.trim();
  const timestamp = input.headers.timestamp?.trim();
  const signature = input.headers.signature?.trim();
  if (!id || !timestamp || !signature) throw new Error('Required Resend signature headers are missing');
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(input.webhookSecret)) throw new Error('Invalid Resend webhook signing secret');
  if (!/^\d{1,12}$/.test(timestamp)) throw new Error('Invalid Resend webhook timestamp');

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) throw new Error('Resend webhook timestamp is outside the accepted window');

  const secretBytes = Buffer.from(input.webhookSecret.slice('whsec_'.length), 'base64');
  if (!secretBytes.length) throw new Error('Invalid Resend webhook signing secret');
  const signedPayload = `${id}.${timestamp}.${input.payload}`;
  const expected = createHmac('sha256', secretBytes).update(signedPayload).digest();
  const signatures = signature.split(/\s+/).flatMap((versioned) => {
    const [version, encoded] = versioned.split(',', 2);
    if (version !== 'v1' || !encoded) return [];
    try { return [Buffer.from(encoded, 'base64')]; } catch { return []; }
  });
  return signatures.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected));
}
