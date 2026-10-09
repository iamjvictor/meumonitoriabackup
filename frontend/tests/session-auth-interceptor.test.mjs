import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), 'src');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('interceptor abre o login para 401 de rotas protegidas', () => {
  const source = read('shared/context/SessionAuthInterceptor.tsx');

  assert.match(source, /response\.status\s*===\s*401/);
  assert.match(source, /AUTH_REQUIRED_EVENT/);
  assert.match(source, /window\.dispatchEvent/);
  assert.match(source, /\/api\/v1\/session/);
  assert.match(source, /\/api\/v1\/auth\//);
});

test('layout global renderiza o modal que escuta sessão ausente', () => {
  const source = read('shared/context/SessionLoginModal.tsx');
  const layout = fs.readFileSync(path.resolve(root, 'app/layout.tsx'), 'utf8');

  assert.match(source, /addEventListener\(AUTH_REQUIRED_EVENT/);
  assert.match(source, /LoginModal/);
  assert.match(layout, /SessionAuthInterceptor/);
  assert.match(layout, /SessionLoginModal/);
});
