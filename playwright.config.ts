import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'github' : 'html',
  use: {
    baseURL: isCI ? 'http://localhost:3000' : 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile project uses WebKit — skip in CI to avoid installing extra browsers
    ...(!isCI
      ? [
          {
            name: 'mobile',
            use: { ...devices['iPhone 14'] },
          },
        ]
      : []),
  ],
  webServer: {
    command: isCI ? 'npm run start' : 'npm run dev -- -p 3001',
    url: isCI ? 'http://localhost:3000' : 'http://localhost:3001',
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
