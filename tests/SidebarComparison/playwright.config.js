// @ts-check
import { defineConfig } from '@playwright/test';
import runSettings from './config/runSettings.json' with { type: 'json' };
import { comparisonReportDir, playwrightReportDir } from './config/reportPaths.js';

// The consolidated reporter opens the native report after all reporters finish.
// Preserve the user's preference while preventing the built-in second opener.
const htmlOpen = process.env.PLAYWRIGHT_HTML_OPEN || process.env.PW_TEST_HTML_REPORT_OPEN;
process.env.PLAYWRIGHT_HTML_OPEN = 'never';
const listOnly = process.env.SIDEBAR_LIST === 'true' || process.argv.includes('--list');

const outputDir = runSettings.outputDir || 'test-results';
const workers = positiveInteger(process.env.WORKERS)
  || (process.env.SIDEBAR_PARALLEL ? positiveInteger(runSettings.parallelWorkers) : 0)
  || positiveInteger(runSettings.workers)
  || 1;

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.js'],
  testIgnore: [
    '**/playwright-report/**',
    '**/comparison-report/**',
    '**/test-results/**',
  ],

  fullyParallel: runSettings.fullyParallel,
  forbidOnly: !!process.env.CI,
  timeout: 10 * 60 * 1000,
  retries: 0,
  workers,
  outputDir,

  reporter: listOnly ? [['list']] : [
    ['list'],
    ['./reporters/consolidatedReporter.js', {
      reportDir: comparisonReportDir, nativeReportDir: playwrightReportDir, htmlOpen,
    }],
    ['html', { outputFolder: playwrightReportDir, open: 'never', title: 'Sidebar Comparison - Playwright Test Report' }],
    ['json', { outputFile: `${outputDir}/results.json` }],
  ],

  use: {
    browserName: 'chromium',
    headless: process.env.SIDEBAR_HEADED !== undefined
      ? process.env.SIDEBAR_HEADED !== 'true'
      : process.env.CI ? true : runSettings.headless,
    launchOptions: {
      slowMo: Number(runSettings.slowMo ?? 0),
      args: [
        '--ignore-certificate-errors',
        ...(runSettings.maximizeWindow ? ['--start-maximized'] : []),
      ],
    },
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

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
