import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('chat blocks concurrent sends and offers retry after a failed request', () => {
  const sidebar = read('src/modules/student/components/StudentRightSidebar.tsx');

  assert.match(sidebar, /if \(isTyping\) return;/);
  assert.match(sidebar, /disabled=\{isTyping \|\|/);
  assert.match(sidebar, /Tentar novamente/);
  assert.match(sidebar, /setRetryRequest/);
});

test('chat preserves subject scope while loading and sending messages', () => {
  const sidebar = read('src/modules/student/components/StudentRightSidebar.tsx');

  assert.match(sidebar, /const currentScopeKey = `\$\{selectedAgent\.monitorId\}:\$\{selectedAgent\.subjectId\}`/);
  assert.match(sidebar, /chatScopeKey === currentScopeKey/);
  assert.match(sidebar, /selectedAgent\.monitorId.*selectedAgent\.subjectId/);
});

test('chat maps important API failures to user-facing messages', () => {
  const sidebar = read('src/modules/student/components/StudentRightSidebar.tsx');

  for (const code of ['CHAT_ACCESS_DENIED', 'CHAT_GENERATION_TIMEOUT', 'CHAT_GENERATION_FAILED']) {
    assert.match(sidebar, new RegExp(code));
  }
  assert.match(sidebar, /Não foi possível gerar uma resposta agora/);
});
