import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'src/app/(student-app)/areadoaluno/pratica/page.tsx'), 'utf8');

test('exibe imagens rastreadas do banco de questões no contexto da prática', () => {
  assert.match(page, /imageUrls\??:\s*string\[\]/);
  assert.match(page, /<OptimizedImage[\s\S]*imageUrl/);
  assert.match(page, /question\.imageUrls/);
});
