// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  fullyParallel: true,

  forbidOnly: !!process.env.CI,

  timeout: 1200000,

  expect: {
    timeout: 100000,
  },

  retries: 0,

  workers: process.env.CI ? 3 : undefined,

  reporter: [ ['json'], ['html', { open: 'always' }], ['list'], ['allure-playwright'] ],

  use: {
    browserName: 'chromium',

    headless: true,

    // IMPORTANT: Set viewport to null for maximize to work
    viewport: null,

   // ✅ Correct position — applies delay to every action


    launchOptions: {
      channel: 'chrome',
      slowMo: 1000,

      args: [
        '--start-maximized'
      ]
    },

    trace: 'on-first-retry',

    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
        viewport: null,
        launchOptions: {
          args: ['--start-maximized']
        }
      }
    },

    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        channel: 'firefox',
        viewport: null,
        launchOptions: {
          args: ['--start-maximized']
        }
      }
    },

    {
      name: 'Microsoft Edge',
      use: {
        channel: 'msedge',
        viewport: null,
        launchOptions: {
          args: ['--start-maximized']
        }
      }
    }
  ]
});