import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 3000, // 3 seconds is enough for these tests
  globalTimeout: 30000, // 30 seconds max for entire test run
  fullyParallel: false, // Run tests sequentially
  workers: 1, // Single worker for sequential execution
  retries: 0, // No retries to fail fast
  reporter: [['list', { printSteps: false }]], // Simpler output
  use: {
    baseURL: 'http://localhost:3000/plan-build-test',
    trace: 'on-first-retry',
    actionTimeout: 2000, // 2 seconds for actions
    navigationTimeout: 3000, // 3 seconds for navigation
  },
  webServer: {
    command: 'node scripts/start-test-server.js',
    port: 3000,
    reuseExistingServer: false,
    timeout: 15000,
    stderr: 'pipe',
    stdout: 'pipe',
  },
});