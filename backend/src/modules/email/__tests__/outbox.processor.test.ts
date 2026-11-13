import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailOutboxCipher } from '../outbox-crypto.js';
import { EmailOutboxProcessor, type EmailOutboxStore } from '../outbox.processor.js';
import { ResendEmailProvider } from '../resend-email.provider.js';

const cipher = new EmailOutboxCipher(Buffer.alloc(32, 4).toString('base64'));
const payload = { from: 'Test <t@example.test>', to: 's@example.test', subject: 'Hi', html: '<p>Hi</p>' };

function fixture(send: () => Promise<Response>, createdAt = new Date(), attempts = 1) {
  const calls: string[] = [];
  let available = true;
  const store: EmailOutboxStore = {
    async claim(id) { if (!available) return null; available = false; return { id, encryptedPayload: cipher.encrypt(payload), idempotencyKey: 'idem-1', createdAt, attempts }; },
    async markAccepted(id, providerId) { calls.push(`accepted:${id}:${providerId}`); },
    async markFailure(id, error, retryAt, uncertain) { calls.push(`failed:${id}:${error}:${retryAt ? 'retry' : 'no-retry'}:${uncertain}`); },
  };
  const provider = new ResendEmailProvider('test-key', async () => send());
  return { processor: new EmailOutboxProcessor(store, cipher, provider), calls };
}

test('claims once, sends decrypted payload and records provider acceptance', async () => {
  const { processor, calls } = fixture(async () => new Response(JSON.stringify({ id: 'resend-id' }), { status: 200 }));
  assert.deepEqual(await processor.process('m1'), { claimed: true, status: 'ACCEPTED', providerMessageId: 'resend-id' });
  assert.deepEqual(calls, ['accepted:m1:resend-id']);
  assert.deepEqual(await processor.process('m1'), { claimed: false });
});

test('does not call Resend after the idempotency deadline and marks message uncertain', async () => {
  let providerCalled = false;
  const { processor, calls } = fixture(async () => { providerCalled = true; return new Response(JSON.stringify({ id: 'wrong' }), { status: 200 }); }, new Date(Date.now() - 24 * 60 * 60_000));
  assert.deepEqual(await processor.process('m-expired'), { claimed: true, status: 'UNCERTAIN' });
  assert.equal(providerCalled, false);
  assert.match(calls[0] ?? '', /failed:m-expired:Resend idempotency window expired/);
});

test('marks exhausted ambiguous transport failure uncertain instead of failed', async () => {
  const { processor, calls } = fixture(async () => { throw new TypeError('socket timeout'); }, new Date(), 5);
  assert.deepEqual(await processor.process('m-timeout'), { claimed: true, status: 'UNCERTAIN' });
  assert.match(calls[0] ?? '', /failed:m-timeout:Resend request failed before a response was received:no-retry:true/);
});

test('sandbox recipient allowlist blocks before Resend and stores no address in status message', async () => {
  let providerCalled = false;
  const base = fixture(async () => { providerCalled = true; return new Response(JSON.stringify({ id: 'nope' }), { status: 200 }); });
  const blocked = new EmailOutboxProcessor(
    // Reuse the fixture processor's controlled dependencies through a new local store.
    { claim: async (id) => ({ id, encryptedPayload: cipher.encrypt(payload), idempotencyKey: 'idem-1', createdAt: new Date(), attempts: 1 }), markAccepted: async () => {}, markFailure: async (_id, message) => { base.calls.push(`blocked:${message}`); } },
    cipher,
    new ResendEmailProvider('test-key', async () => { providerCalled = true; return new Response(JSON.stringify({ id: 'nope' }), { status: 200 }); }),
    { sandboxAllowedRecipients: ['approved@example.test'] },
  );
  assert.deepEqual(await blocked.process('m-blocked'), { claimed: true, status: 'BLOCKED' });
  assert.equal(providerCalled, false);
  assert.equal(base.calls[0], 'blocked:Sandbox recipient blocked by allowlist');
  assert.equal(base.calls[0]?.includes('s@example.test'), false);
});

test('persists send failure and does not claim it as accepted', async () => {
  const { processor, calls } = fixture(async () => new Response(JSON.stringify({ message: 'Rejected recipient' }), { status: 422 }));
  assert.deepEqual(await processor.process('m2'), { claimed: true, status: 'FAILED' });
  assert.deepEqual(calls, ['failed:m2:Rejected recipient:no-retry:false']);
});
