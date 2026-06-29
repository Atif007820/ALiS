// @ts-check
import { defineConfig } from '@playwright/test';
import runSettings from './config/runSettings.json' with { type: 'json' };

const outputDir = runSettings.outputDir || 'test-results';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.js'],
  testIgnore: [
    '**/playwright-report/**',
    '**/test-results/**',
  ],

  fullyParallel: runSettings.fullyParallel,
  forbidOnly: !!process.env.CI,
  timeout: 10 * 60 * 1000,
  retries: 0,
  workers: runSettings.workers,

  reporter: [
    ['list'],
    ['html', {
      open: 'always',
      outputFolder: 'playwright-report',
    }],
    ['json', { outputFile: `${outputDir}/results.json` }],
  ],

  use: {
    browserName: 'chromium',
    headless: process.env.CI ? true : runSettings.headless,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: runSettings.viewport,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
  ],
});
