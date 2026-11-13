import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailOutboxCipher, hashEmailRecipient } from '../outbox-crypto.js';

const key = Buffer.alloc(32, 7).toString('base64');
const payload = { from: 'Equipe <oi@example.test>', to: 'aluno@example.test', subject: 'Convite', html: '<p>token=segredo</p>' };

test('cifra payload de email e recupera o conteúdo', () => {
  const cipher = new EmailOutboxCipher(key);
  const encrypted = cipher.encrypt(payload);
  assert.notEqual(encrypted.includes('segredo'), true);
  assert.deepEqual(cipher.decrypt(encrypted), payload);
});

test('rejeita chave inválida e payload adulterado', () => {
  assert.throws(() => new EmailOutboxCipher('invalid'), /Base64/);
  const cipher = new EmailOutboxCipher(key);
  const encrypted = cipher.encrypt(payload);
  assert.throws(() => cipher.decrypt(`${encrypted.slice(0, -2)}AA`));
});

test('hash de email é normalizado sem persistir endereço puro', () => {
  assert.equal(hashEmailRecipient(' A@Example.test '), hashEmailRecipient('a@example.test'));
  assert.notEqual(hashEmailRecipient('a@example.test'), 'a@example.test');
});
