import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('generation POST sends a valid JSON body when declaring application/json', () => {
  const service = readFileSync(resolve(root, 'src/app/(student-app)/areadoaluno/services/student-dashboard.service.ts'), 'utf8');
  assert.match(service, /generateWeeklySimulation:[\s\S]*method: 'POST'[\s\S]*Content-Type': 'application\/json'[\s\S]*body: '\{\}'/);
});
