import { defineConfig, devices } from '@playwright/test';

const PORT = 41730;
const isCI = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: 'test/browser',
  forbidOnly: isCI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}/`,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs conformance',
    url: `http://127.0.0.1:${String(PORT)}/harness/browser/index.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
  },
});
