// @ts-check
import { defineConfig } from '@playwright/test';
import runSettings from './config/runSettings.json' with { type: 'json' };

export default defineConfig({
    testDir: '.',
    testMatch: ['**/*.spec.js'],
    testIgnore: [
        '**/playwright-report/**',
        '**/test-results/**',
        '**/node_modules/**',
    ],

    fullyParallel: runSettings.fullyParallel,
    forbidOnly:    !!process.env.CI,
    timeout:       runSettings.timeoutMs,
    retries:       runSettings.retries,
    workers:       runSettings.workers,

    reporter: [
        ['list'],
        ['html',  {
            open: runSettings.reports.openPlaywrightReport ? 'always' : 'never',
            outputFolder: runSettings.reports.playwrightReportDir,
        }],
        ['json',  { outputFile: runSettings.reports.jsonOutputFile }],
    ],

    use: {
        headless: process.env.CI ? true : runSettings.browser.headless,
        ignoreHTTPSErrors: runSettings.browser.ignoreHTTPSErrors,
        viewport: runSettings.browser.viewport,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        { name: 'chromium' },
    ],
});
