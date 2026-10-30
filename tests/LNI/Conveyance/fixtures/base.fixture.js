import { test as base, expect } from '@playwright/test';
import { LoginPage }             from '../pages/LoginPage.js';
import { RegistrationPage }      from '../pages/RegistrationPage.js';
import { DashboardPage }         from '../pages/DashboardPage.js';
import { PermitApplicationPage } from '../pages/PermitApplicationPage.js';

/**
 * Extended Playwright `test` object.
 * Each fixture property is a fully-initialised Page Object instance,
 * injected automatically into every test that declares it as a parameter.
 *
 * Usage in tests:
 *   import { test, expect } from '../framework.js';
 *   test('my test', async ({ loginPage, dashboardPage }) => { ... });
 *
 * Available fixtures:
 *   loginPage              — LoginPage
 *   registrationPage       — RegistrationPage
 *   dashboardPage          — DashboardPage
 *   permitApplicationPage  — PermitApplicationPage (composes MachineInformationPage + DocumentUploadComponent)
 */
export const test = base.extend({

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  registrationPage: async ({ page }, use) => {
    await use(new RegistrationPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  permitApplicationPage: async ({ page }, use) => {
    await use(new PermitApplicationPage(page));
  },

});

export { expect };
