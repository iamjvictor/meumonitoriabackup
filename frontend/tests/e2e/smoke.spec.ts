import { expect, test } from '@playwright/test';

test('landing page renders without horizontal overflow at critical widths', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/MeuMonitor AI/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  for (const width of [375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: testInfo.outputPath(`landing-${width}.png`), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('login query opens the accessible login form', async ({ page }) => {
  await page.goto('/?login=true&perfil=aluno');
  await expect(page.getByRole('heading', { name: /MeuMonitor AI/i }).last()).toBeVisible();
  await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /senha/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar na Plataforma/i })).toBeVisible();
});

test('protected routes remain reachable for the client session guard', async ({ page }) => {
  for (const route of ['/areadoaluno', '/areadoaluno/pratica', '/areadoaluno/ranking', '/professor', '/professor/perfil']) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
  }
});

test('critical student and staff routes render within the mobile viewport', async ({ page }, testInfo) => {
  const routes = ['/areadoaluno', '/areadoaluno/pratica', '/areadoaluno/ranking', '/professor', '/professor/perfil'];

  await page.setViewportSize({ width: 375, height: 640 });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`critical-${route.replaceAll('/', '-')}.png`), fullPage: false });
  }
});

test('login remains usable in low and landscape viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 640 });
  await page.goto('/?login=true&perfil=aluno');
  await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: /senha/i })).toBeVisible();

  await page.setViewportSize({ width: 812, height: 375 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
