import assert from 'node:assert/strict';
import test from 'node:test';
import { ResendEmailError, ResendEmailProvider } from '../resend-email.provider.js';

test('sends email with auth and idempotency key, returns provider id', async () => {
  let request: RequestInit | undefined;
  const provider = new ResendEmailProvider('secret-test', async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  });
  const result = await provider.send({ from: 'Test <hello@example.test>', to: 'student@example.test', subject: 'Welcome', html: '<p>Hello</p>', text: 'Hello', idempotencyKey: 'welcome-seat-1' });
  assert.deepEqual(result, { id: 'email_123' });
  assert.equal(new Headers(request?.headers).get('Authorization'), 'Bearer secret-test');
  assert.equal(new Headers(request?.headers).get('Idempotency-Key'), 'welcome-seat-1');
  assert.deepEqual(JSON.parse(String(request?.body)), { from: 'Test <hello@example.test>', to: ['student@example.test'], subject: 'Welcome', html: '<p>Hello</p>', text: 'Hello' });
});

test('throws provider error without exposing authorization secret', async () => {
  const provider = new ResendEmailProvider('do-not-leak', async () => new Response(JSON.stringify({ message: 'Invalid from address' }), { status: 422 }));
  await assert.rejects(provider.send({ from: 'bad', to: 'a@b.test', subject: 'x', html: 'x', idempotencyKey: 'k' }), (error: unknown) => {
    assert.ok(error instanceof ResendEmailError);
    assert.equal(error.status, 422);
    assert.equal(error.message, 'Invalid from address');
    assert.equal(error.message.includes('do-not-leak'), false);
    return true;
  });
});

test('rejects missing idempotency key and malformed success response', async () => {
  const provider = new ResendEmailProvider('secret', async () => new Response('{}', { status: 200 }));
  await assert.rejects(provider.send({ from: 'a', to: 'b@c.test', subject: 's', html: 'h', idempotencyKey: ' ' }), ResendEmailError);
  await assert.rejects(provider.send({ from: 'a', to: 'b@c.test', subject: 's', html: 'h', idempotencyKey: 'key' }), /did not include an email ID/);
});

test('aborts a request that exceeds its timeout and returns a retryable transport error', async () => {
  const provider = new ResendEmailProvider('test-key', (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }), 'https://api.resend.test/emails', 5);
  await assert.rejects(provider.send({ from: 'a', to: 'b@c.test', subject: 's', html: 'h', idempotencyKey: 'retry-key' }), (error: unknown) => {
    assert.ok(error instanceof ResendEmailError);
    assert.equal(error.status, undefined);
    assert.match(error.message, /before a response/);
    return true;
  });
});
