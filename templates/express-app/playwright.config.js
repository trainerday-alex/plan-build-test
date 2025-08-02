import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000/plan-build-test',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});