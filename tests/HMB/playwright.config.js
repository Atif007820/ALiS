// @ts-check
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from './config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.dirname(fileURLToPath(import.meta.url));
const headlessFromEnv = process.env.HEADLESS;
const headless = headlessFromEnv === undefined
  ? runSettings.headless
  : !/^false|0|no$/i.test(headlessFromEnv);

export default defineConfig({
  testDir: './tests',
  fullyParallel: Boolean(runSettings.fullyParallel),
  timeout: runSettings.testTimeout,
  workers: Number(process.env.HMB_WORKERS || runSettings.workers || 1),
  outputDir: path.join(frameworkRoot, 'test-results'),
  retries: 0,
  expect: {
    timeout: 30000,
  },
  reporter: [
    ['list'],
    ['html', {
      outputFolder: path.join(frameworkRoot, 'playwright-report'),
      open: runSettings.openHtmlReport ? 'always' : 'never',
    }],
    ['json', { outputFile: path.join(frameworkRoot, 'test-results', 'results.json') }],
  ],
  use: {
    headless,
    viewport: runSettings.maximizeWindow ? null : runSettings.viewport,
    launchOptions: {
      slowMo: Number(process.env.PW_SLOWMO || runSettings.slowMo || 0),
      args: runSettings.maximizeWindow ? ['--start-maximized'] : [],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: runSettings.actionTimeout,
    navigationTimeout: runSettings.navigationTimeout,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'msedge', use: { browserName: 'chromium', channel: 'msedge' } },
  ],
});
