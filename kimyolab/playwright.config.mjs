// E2E runs against a freshly built dist served by the real server module (see tests/helpers/dist.mjs).
import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {...devices['Desktop Chrome'], trace: 'retain-on-failure'},
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
});
