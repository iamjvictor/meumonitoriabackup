import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: '/usr/bin/google-chrome' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Use the installed Chrome binary with a mobile viewport. The environment
    // does not provide a separate bundled mobile browser executable.
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 640 } } },
  ],
  webServer: process.env.AUTH_SMOKE_FRONTEND_URL ? undefined : {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
