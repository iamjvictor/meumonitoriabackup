import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const content = readFileSync(resolve(root, 'src/app/(student-app)/areadoaluno/ranking/page.tsx'), 'utf8');

test('ranking não refaz a consulta ao atualizar os próprios resultados', () => {
  assert.doesNotMatch(content, /\[apiUrl, currentStudentStats\?\.totalChallenges, isLoadingPerformance, rankingRetryNonce, selectedMonth, selectedMonitorId, selectedPeriod, status, student\?\.fullName, student\?\.userId, subscribedMonitors\]/);
});
