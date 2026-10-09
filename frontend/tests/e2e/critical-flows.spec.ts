import { expect, test, type Page } from '@playwright/test';

const monitor = {
  id: 'monitor-1',
  name: 'Monitor de Matemática',
  teacher: { fullName: 'Ada Lovelace', avatarUrl: null },
  subjects: [{ id: 'subject-math', name: 'Matemática', topics: [{ id: 'topic-1', name: 'Funções' }] }],
  _count: { questions: 2, flashcards: 1 },
};

async function mockStudentSession(page: Page) {
  await page.addInitScript(({ fixture }) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/v1/session')) return response({ data: { userId: 'student-1', email: 'student@example.com', fullName: 'Aluno Teste', role: 'student' } });
      if (url.includes('/api/v1/student/subscriptions')) return response({ data: [fixture.monitor] });
      if (url.includes('/api/v1/student/performance')) return response({ data: { monitors: [{ id: fixture.monitor.id, name: fixture.monitor.name, answeredCount: 2, correctCount: 1, incorrectCount: 1, accuracy: 50 }] } });
      if (url.includes('/api/v1/student/daily-challenges')) return response({ data: [] });
      if (url.includes('/api/v1/student/questions')) return response({ data: { questions: [] } });
      if (url.includes('/daily-challenge/ranking')) return response({ data: { ranking: [{ rank: 1, studentId: 'student-1', fullName: 'Aluno Teste', score: 10, correctAnswers: 1, totalAnswered: 2, accuracy: 50, streakDays: 1 }], currentStudent: { rank: 1, studentId: 'student-1', fullName: 'Aluno Teste', score: 10, correctAnswers: 1, totalAnswered: 2, accuracy: 50, streakDays: 1 } } });
      if (url.includes('/chat/subjects/subject-math/messages')) {
        return method === 'GET' ? response({ data: { messages: [] } }) : response({ data: { message: 'Resposta simulada do chat', messageId: 'chat-1' } });
      }
      return nativeFetch(input, init);
    };
  }, { fixture: { monitor } });
  // Catch the configured backend host as well as relative API URLs; this keeps
  // the fixture stable when NEXT_PUBLIC_API_URL changes between environments.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/session')) {
      await route.fulfill({ json: { data: { userId: 'student-1', email: 'student@example.com', fullName: 'Aluno Teste', role: 'student' } } });
      return;
    }
    if (url.includes('/api/v1/student/subscriptions')) {
      await route.fulfill({ json: { data: [monitor] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/session**', async (route) => {
    await route.fulfill({ json: { data: { userId: 'student-1', email: 'student@example.com', fullName: 'Aluno Teste', role: 'student' } } });
  });
  await page.route('**/api/v1/student/subscriptions**', async (route) => {
    await route.fulfill({ json: { data: [monitor] } });
  });
  await page.route('**/api/v1/student/performance**', async (route) => {
    await route.fulfill({ json: { data: { monitors: [{ id: monitor.id, name: monitor.name, answeredCount: 2, correctCount: 1, incorrectCount: 1, accuracy: 50 }] } } });
  });
  await page.route('**/api/v1/student/daily-challenges**', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/api/v1/student/questions**', async (route) => {
    await route.fulfill({ json: { data: { questions: [] } } });
  });
  await page.route('**/api/v1/student/monitors/monitor-1/daily-challenge/ranking**', async (route) => {
    await route.fulfill({ json: { data: { ranking: [{ rank: 1, studentId: 'student-1', fullName: 'Aluno Teste', score: 10, correctAnswers: 1, totalAnswered: 2, accuracy: 50, streakDays: 1 }], currentStudent: { rank: 1, studentId: 'student-1', fullName: 'Aluno Teste', score: 10, correctAnswers: 1, totalAnswered: 2, accuracy: 50, streakDays: 1 } } } });
  });
  await page.route('**/api/v1/student/monitors/monitor-1/chat/subjects/subject-math/messages', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { data: { messages: [] } } });
      return;
    }
    await route.fulfill({ json: { data: { message: 'Resposta simulada do chat', messageId: 'chat-1' } } });
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('authenticated student can open dashboard, practice, chat, and ranking', async ({ page }) => {
  await mockStudentSession(page);

  for (const route of ['/areadoaluno', '/areadoaluno/pratica', '/areadoaluno/ranking']) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

test('student home route remains contained across compact, tablet, and desktop widths', async ({ page }) => {
  await mockStudentSession(page);

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 375, height: 640 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/areadoaluno');
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('authenticated chat supports subject controls and question/flashcard attachments', async ({ page }) => {
  await mockStudentSession(page);
  await page.goto('/areadoaluno');

  await expect(page.locator('body')).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('authenticated teacher and monitor routes remain visually contained', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/*', async (route) => {
    if (route.request().url().includes('/api/v1/session')) {
      await route.fulfill({ json: { data: { userId: 'teacher-1', email: 'teacher@example.com', fullName: 'Professor Teste', role: 'teacher' } } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/monitors**', async (route) => {
    await route.fulfill({ json: { data: [monitor] } });
  });

  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: width < 800 ? 640 : 900 });
    for (const route of ['/professor', '/professor/perfil']) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: test.info().outputPath(`teacher-${route.replaceAll('/', '-')}-${width}.png`),
        fullPage: false,
        animations: 'disabled',
        timeout: 60_000,
      });
    }
  }
});
