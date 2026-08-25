// @ts-check
import { defineConfig } from '@playwright/test';
import runConfig from './config/runsettings.json' with { type: 'json' };

export default defineConfig({
  testDir: './tests',
  outputDir: runConfig.playwrightOutputDir,
  timeout: 1200000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', {
      open: runConfig.openPlaywrightReport ? 'always' : 'never',
      outputFolder: runConfig.playwrightReportDir
    }]
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  }
});
