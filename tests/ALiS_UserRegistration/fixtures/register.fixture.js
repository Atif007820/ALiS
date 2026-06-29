import { test as base, expect } from '@playwright/test';
import { RegistrationPage } from '../pages/RegistrationPage.js';
import { siteRegistry } from '../registry/siteRegistry.js';

export const test = base.extend({
  registrationPage: async ({ page }, use) => {
    await use(new RegistrationPage(page));
  },

  sites: async ({}, use) => {
    await use(siteRegistry);
  },
});

export { expect };
