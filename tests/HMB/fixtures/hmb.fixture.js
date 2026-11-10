import { test as base, expect } from '@playwright/test';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { HmbLoginApplyPage } from '../pages/HmbLoginApplyPage.js';
import { HmbRegistrationPage } from '../pages/HmbRegistrationPage.js';
import { HmbApproveApplicationPage } from '../pages/HmbApproveApplicationPage.js';

const test = base.extend({
  registrationPage: async ({ page }, use) => {
    await use(new HmbRegistrationPage(page));
  },

  loginApplyPage: async ({ page }, use) => {
    await use(new HmbLoginApplyPage(page));
  },

  approvalPage: async ({ page }, use) => {
    await use(new HmbApproveApplicationPage(page));
  },
});

export { expect, runSettings, test };
