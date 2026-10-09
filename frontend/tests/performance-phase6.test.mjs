import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('modais pesados de marketing são carregados sob demanda', () => {
  const source = read('src/app/(marketing)/page.tsx');
  assert.match(source, /from ['"]next\/dynamic['"]/);
  assert.match(source, /dynamic\(\s*\(\) => import\(['"]@\/modules\/marketing\/components\/TeacherRegistrationModal/);
  assert.match(source, /dynamic\(\s*\(\) => import\(['"]@\/modules\/marketing\/components\/LoginModal/);
  assert.doesNotMatch(source, /import \{ TeacherRegistrationModal \}/);
  assert.doesNotMatch(source, /import \{ LoginModal \}/);
});

test('modais pesados das áreas de aluno, professor e storefront são lazy', () => {
  for (const file of [
    'src/modules/teacher/components/TeacherDashboardOverview.tsx',
    'src/app/(student-app)/areadoaluno/page.tsx',
    'src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx',
    'src/modules/teacher/components/monitor/MonitorWorkspace.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /from ['"]next\/dynamic['"]/, `${file} deve usar next/dynamic`);
    assert.match(source, /ssr:\s*false/, `${file} deve evitar SSR de modal interativo`);
  }
});

test('hero usa next/image para otimização da imagem principal', () => {
  const source = read('src/modules/marketing/components/HeroSection.tsx');
  assert.match(source, /from ['"]next\/image['"]/);
  assert.match(source, /<Image[\s\S]*src="\/hero-image\.png"/);
  assert.doesNotMatch(source, /<img[\s\S]*src="\/hero-image\.png"/);
});
