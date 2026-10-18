import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../src/app/(student-app)/areadoaluno/pratica/page.tsx', import.meta.url);

test('practice reset explains the preserved performance history', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /Refazer questões/);
  assert.match(page, /practiceStats\.attemptsCount/);
  assert.match(page, /practiceStats\.correctCount/);
  assert.match(page, /histórico de desempenho será preservado/);
  assert.doesNotMatch(page, /window\.confirm/);
  assert.match(page, /AlertModal/);
  assert.match(page, /Acertadas/);
  assert.match(page, /Erradas/);
  assert.match(page, /const isSubmitted = hasSubmitted && !isSubmitting/);
});

test('practice flashcards offer the reusable AI doubt action', async () => {
  const page = await readFile(pagePath, 'utf8');
  const buttonPath = new URL('../src/app/(student-app)/areadoaluno/components/AskAiContextButton.tsx', import.meta.url);
  const button = await readFile(buttonPath, 'utf8');

  assert.match(page, /setActiveFlashcardContext/);
  assert.match(page, /<AskAiContextButton/);
  assert.match(page, /monitorId: json\.data\.monitorId/);
  assert.match(button, /Tirar dúvida com IA/);
  assert.match(button, /Contexto anexado ao chat/);
  assert.match(page, /router\.push\('\/areadoaluno\/chat'\)/);
});

test('flashcard practice sends the selected monitor, subject and topic filters', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /Filtrar flashcards por monitor/);
  assert.match(page, /Filtrar flashcards por matéria/);
  assert.match(page, /Filtrar flashcards por tópico/);
  assert.match(page, /params\.set\('subjectId', selectedSubjectId\)/);
  assert.match(page, /params\.set\('topicId', selectedTopicId\)/);
});

test('dashboard performance banner consumes the real daily challenge summary', async () => {
  const componentPath = new URL('../src/app/(student-app)/areadoaluno/components/DashboardPerformanceSection.tsx', import.meta.url);
  const hookPath = new URL('../src/app/(student-app)/areadoaluno/hooks/useStudentDashboard.ts', import.meta.url);
  const servicePath = new URL('../src/app/(student-app)/areadoaluno/services/student-dashboard.service.ts', import.meta.url);
  const component = await readFile(componentPath, 'utf8');
  const hook = await readFile(hookPath, 'utf8');
  const service = await readFile(servicePath, 'utf8');

  assert.match(service, /daily-challenges\/summary/);
  assert.match(hook, /loadDailyChallengeSummary/);
  assert.match(component, /dailyChallengeSummary/);
  assert.match(component, /currentStudent\.streakDays/);
  assert.match(component, /currentStudent\.correctAnswers/);
  assert.match(component, /currentStudent\.rank/);
  assert.match(component, /challengeDays/);
  assert.doesNotMatch(component, /isChallengeDone = idx >= 2/);
});

test('dashboard performance banner uses historical practice stats after reset', async () => {
  const componentPath = new URL('../src/app/(student-app)/areadoaluno/components/DashboardPerformanceSection.tsx', import.meta.url);
  const hookPath = new URL('../src/app/(student-app)/areadoaluno/hooks/useStudentDashboard.ts', import.meta.url);
  const component = await readFile(componentPath, 'utf8');
  const hook = await readFile(hookPath, 'utf8');

  assert.match(component, /Seu progresso/);
  assert.match(hook, /historicalStats/);
  assert.match(hook, /statsBody\.data\?\.stats/);
  assert.doesNotMatch(hook, /questionAttempts\?\.\[0\]/);
});

test('performance scope uses one monitor selector for all activity types', async () => {
  const componentPath = new URL('../src/app/(student-app)/areadoaluno/desempenho/components/PerformanceByActivity.tsx', import.meta.url);
  const pagePath = new URL('../src/app/(student-app)/areadoaluno/desempenho/page.tsx', import.meta.url);
  const component = await readFile(componentPath, 'utf8');
  const page = await readFile(pagePath, 'utf8');

  assert.match(component, /Questões/);
  assert.match(component, /Flashcards/);
  assert.match(component, /Simulados/);
  assert.match(component, /Desafios diários/);
  assert.match(component, /selectedMonitorId/);
  assert.match(page, /PerformanceByActivity/);
  assert.match(page, /performance\.simulados/);
  assert.match(page, /performance\.dailyChallenges/);
});

test('performance activity sections show subject and topic details', async () => {
  const componentPath = new URL('../src/app/(student-app)/areadoaluno/desempenho/components/PerformanceByActivity.tsx', import.meta.url);
  const component = await readFile(componentPath, 'utf8');

  assert.match(component, /Detalhamento por matéria/);
  assert.match(component, /Tópicos/);
  assert.match(component, /Acertos/);
  assert.match(component, /Erros/);
  assert.match(component, /Retenção/);
  assert.match(component, /Questões/);
  assert.match(component, /Flashcards/);
  assert.match(component, /Simulados/);
  assert.match(component, /Desafios diários/);
});

test('performance activity details use compact responsive grids', async () => {
  const componentPath = new URL('../src/app/(student-app)/areadoaluno/desempenho/components/PerformanceByActivity.tsx', import.meta.url);
  const component = await readFile(componentPath, 'utf8');

  assert.match(component, /mt-4 grid gap-3 md:grid-cols-2/);
  assert.match(component, /mt-3 grid gap-3 sm:grid-cols-2/);
});
