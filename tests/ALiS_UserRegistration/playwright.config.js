// @ts-check
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineConfig } from '@playwright/test';
import { headlessFromSettings } from './utils/helpers.js';

const configRoot = dirname(fileURLToPath(import.meta.url));
const runSettings = JSON.parse(readFileSync(resolve(configRoot, 'config/runSettings.json'), 'utf-8'));
const commonExcelReportUrl = pathToFileURL(resolve(configRoot, 'playwright-report', 'latest-registration-report.xlsx')).href;

export default defineConfig({
  testDir: './tests',
  fullyParallel: fullyParallelFromSettings(),
  forbidOnly: Boolean(process.env.CI),
  timeout: 1200000,
  expect: { timeout: 100000 },
  retries: 0,
  workers: workersFromSettings(),
  metadata: {
    'Excel Report': commonExcelReportUrl,
  },
  reporter: [
    ['list'],
    ['./reporters/RegistrationExcelReporter.js'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    headless: headlessFromSettings(),
    viewport: runSettings.viewport,
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? runSettings.slowMo ?? 0),
      args: runSettings.maximizeWindow ? ['--start-maximized'] : [],
    },
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
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
      },
    },
    {
      name: 'msedge',
      use: {
        browserName: 'chromium',
        channel: 'msedge',
      },
    },
  ],
});

function fullyParallelFromSettings() {
  if (process.env.REGISTER_FULLY_PARALLEL !== undefined) {
    return !/^false|0|no$/i.test(process.env.REGISTER_FULLY_PARALLEL);
  }

  return Boolean(runSettings.fullyParallel);
}

function workersFromSettings() {
  const configured = process.env.REGISTER_WORKERS
    ?? process.env.PW_WORKERS
    ?? (process.env.CI ? runSettings.ciWorkers : runSettings.workers)
    ?? (process.env.CI ? 3 : 1);

  const numeric = Number(configured);
  return Number.isFinite(numeric) ? numeric : String(configured);
}
