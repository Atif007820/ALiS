// @ts-check
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const configRoot = dirname(fileURLToPath(import.meta.url));
const runSettings = JSON.parse(readFileSync(resolve(configRoot, 'config/runSettings.json'), 'utf8'));

export default defineConfig({
  testDir: './test-cases',
  fullyParallel: fullyParallelFromSettings(),
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  outputDir: './test-results/playwright-artifacts',
  workers: workersFromSettings(),
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-results/playwright-report', open: 'never' }],
  ],
  use: {
    headless: headlessFromSettings(),
    viewport: runSettings.viewport,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      slowMo: Number(process.env.SLOW_MO ?? runSettings.slowMo ?? 0),
      args: runSettings.maximizeWindow ? ['--start-maximized'] : [],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
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
  if (process.env.BASELINE_FULLY_PARALLEL !== undefined) {
    return !/^false|0|no$/i.test(process.env.BASELINE_FULLY_PARALLEL);
  }

  return Boolean(runSettings.fullyParallel);
}

function workersFromSettings() {
  const configured = process.env.BASELINE_WORKERS
    ?? process.env.PW_WORKERS
    ?? (process.env.CI ? runSettings.ciWorkers : runSettings.workers)
    ?? (process.env.CI ? 3 : 1);

  const numeric = Number(configured);
  return Number.isFinite(numeric) ? numeric : String(configured);
}

function headlessFromSettings() {
  if (process.env.HEADLESS !== undefined) {
    return !/^false|0|no$/i.test(process.env.HEADLESS);
  }

  return Boolean(runSettings.headless);
}
