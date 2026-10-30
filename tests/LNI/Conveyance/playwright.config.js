// @ts-check
import { defineConfig } from '@playwright/test';
import { appConfig } from './config/runConfig.js';

const launchOptions = {
  slowMo: appConfig.slowMo,
  args: appConfig.maximizeWindow ? ['--start-maximized'] : [],
};

export default defineConfig({
  testDir: './testScripts',
  testMatch: ['**/*.spec.js'],
  testIgnore: [
    '**/playwright-report/**',
    '**/test-results/**',
  ],

  fullyParallel: appConfig.fullyParallel,
  forbidOnly: !!process.env.CI,
  timeout: appConfig.timeouts.test,

  expect: {
    timeout: appConfig.timeouts.expect,
  },

  retries: 0,
  workers: process.env.CI ? 3 : appConfig.workers,

  reporter: [
    ['json'],
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    browserName: 'chromium',
    headless: appConfig.headless,
    viewport: appConfig.viewport,
    actionTimeout: appConfig.timeouts.action,
    navigationTimeout: appConfig.timeouts.navigation,
    launchOptions,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
        viewport: appConfig.viewport,
        launchOptions,
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        viewport: appConfig.viewport,
        launchOptions,
      },
    },
    {
      name: 'Microsoft Edge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
        viewport: appConfig.viewport,
        launchOptions,
      },
    },
  ],
});
