import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { LOGIN_URL } from '../config/URL.js';
import { fillField, isVisible } from '../utils/formActions.js';
import { logger } from '../utils/logger.js';

export class LoginPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.dashboardLink  = page.getByText('NPApply for New Permit');
    this.loginNameField = page.getByRole('textbox', { name: 'Login Name' });
    this.passwordField  = page.getByRole('textbox', { name: 'Password' });
    this.loginButton    = page.getByRole('link', { name: 'Login' });
  }

  /** Navigate to the login page. */
  async goto() {
    await super.goto(LOGIN_URL);
  }

  /**
   * Log in with the supplied credentials.
   * Skips login if an active session is already detected (unless `force` is true).
   *
   * @param {{ loginName: string, password: string }} userData
   * @param {{ force?: boolean, landing?: import('@playwright/test').Locator }} [options]
   */
  async login(userData, { force = false, landing = this.dashboardLink } = {}) {
    if (!userData?.loginName || !userData?.password) {
      throw new Error('userData must include loginName and password.');
    }

    await this.goto();

    if (!force && await isVisible(landing, 15000)) {
      logger.success('Existing logged-in state restored');
      return;
    }

    if (!(await isVisible(this.loginNameField, 15000))) {
      if (await isVisible(landing, 10000)) {
        logger.success('Existing logged-in state restored');
        return;
      }
      throw new Error('Neither the dashboard nor the login form became visible.');
    }

    await fillField(this.loginNameField, userData.loginName, { pressTab: false });
    await this.passwordField.or(this.page.locator('input[type="password"]'))
      .filter({ visible: true }).first().fill(userData.password);
    await this.loginButton.click();
    await this.waitForLoad();
    await expect(landing).toBeVisible({ timeout: 150000 });
    logger.success('Login successful');
  }
}
