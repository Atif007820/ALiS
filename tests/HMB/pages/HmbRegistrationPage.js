import { expect } from '@playwright/test';
import { HMB_DATA } from '../config/editableData.js';
import { URLS } from '../config/urls.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { buildRegistrationUser } from '../utils/hmbDataFactory.js';
import { clickAndWait, fill, select, waitAfterAction, waitForPageReady } from '../utils/formActions.js';
import { logger } from '../utils/logger.js';

export class HmbRegistrationPage {
  constructor(page) {
    this.page = page;
  }

  async register(overrides = {}, { maxAttempts = 3 } = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const user = buildRegistrationUser(overrides);
      if (attempt > 1 && !overrides.loginName) {
        user.loginName = buildRegistrationUser().loginName;
      }

      logger.section(`Register HMB User (attempt ${attempt}/${maxAttempts})`);
      logger.info(`Entity Name: ${user.entityName}`);
      logger.info(`Login Name: ${user.loginName}`);

      await this.openRegistrationForm();
      await this.fillRegistrationForm(user);
      await clickAndWait(this.page, this.page.getByRole('link', { name: /^Register$/i }), {
        label: 'Register link',
        timeout: 60000,
      });

      const validationText = await this.getVisibleValidationText();
      if (!validationText) {
        user.hmbCode = await this.captureHmbCode();
        logger.info(`Registration completed. HMB Code: ${user.hmbCode}`);
        return user;
      }

      lastError = new Error(`Registration failed validation: ${validationText}`);
      const canRetry = /already exists|duplicate|login name/i.test(validationText)
        && !overrides.loginName
        && attempt < maxAttempts;

      if (!canRetry) throw lastError;
      logger.warn(`${lastError.message}. Retrying with a fresh login name.`);
    }

    throw lastError || new Error('Registration failed.');
  }

  async openRegistrationForm() {
    await this.page.goto(URLS.loginUrl, { waitUntil: 'domcontentloaded', timeout: runSettings.navigationTimeout });
    await waitForPageReady(this.page);
    await this.selectHumanMilkBankPortal();
    await clickAndWait(this.page, this.page.getByRole('link', { name: /^Click Here$/i }), {
      label: 'Click Here registration link',
      timeout: 60000,
    });
  }

  async selectHumanMilkBankPortal() {
    const portal = this.page.getByText('Human Milk Bank', { exact: true });
    if (await portal.first().isVisible().catch(() => false)) {
      await clickAndWait(this.page, portal.first(), { label: 'Human Milk Bank portal' });
    }
  }

  async fillRegistrationForm(user) {
    await fill(this.page, this.page.getByRole('textbox', { name: /Entity Name \(Legal Name\)/i }), user.entityName, {
      label: 'Entity Name Legal Name',
    });
    await fill(this.page, this.page.getByRole('textbox', { name: /Entity Name \(DBA Name\)/i }), user.entityName, {
      label: 'Entity Name DBA Name',
    });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Last Name/i }), user.lastName, { label: 'Last Name' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^First Name/i }), user.firstName, { label: 'First Name' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Email ID/i }), user.email, { label: 'Email ID' });

    await fill(this.page, this.page.getByRole('textbox', { name: /^Street One/i }), user.streetOne, { label: 'Street One' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Street Two/i }), user.streetTwo, { label: 'Street Two' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^City/i }), user.city, { label: 'City' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Zip/i }), user.zip, { label: 'Zip' });
    await this.selectAndVerifyCounty(user.county);
    await fill(this.page, this.page.getByRole('textbox', { name: /^Phone$/i }), user.phone, { label: 'Phone' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Fax/i }), user.fax, { label: 'Fax' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Email$/i }), user.email, { label: 'Email' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Alt Email/i }), user.altEmail, { label: 'Alt Email' });

    await fill(this.page, this.page.getByRole('textbox', { name: /Login Name/i }), user.loginName, { label: 'Login Name' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Password/i }), user.password, { label: 'Password' });
    await fill(this.page, this.page.getByRole('textbox', { name: /Re-type Password/i }), user.password, {
      label: 'Re-type Password',
    });
  }

  async selectAndVerifyCounty(county) {
    const countySelect = this.page.getByLabel('County');

    for (let attempt = 1; attempt <= 3; attempt++) {
      await select(this.page, countySelect, county, { label: `County attempt ${attempt}` });
      await waitAfterAction(this.page);

      const value = await countySelect.inputValue().catch(() => '');
      if (value === county) return;

      logger.warn(`County reset after selection. Expected "${county}", actual "${value}".`);
    }

    throw new Error(`Could not persist County selection "${county}" on registration form.`);
  }

  async getVisibleValidationText() {
    await this.page.waitForTimeout(1000);
    const bodyText = await this.page.locator('body').innerText().catch(() => '');
    const lines = bodyText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((line) => /required field|already exists|invalid|does not match|duplicate/i.test(line));

    return [...new Set(lines)].join(' ');
  }

  async captureHmbCode() {
    const bodyText = await this.page.locator('body').innerText().catch(() => '');
    const labeled = bodyText.match(/(?:HMB|Registration|Application|Entity)\s*(?:Code|Number|#)?\s*:?\s*(\d{4,})/i);
    if (labeled) return labeled[1];

    const visibleNumber = this.page.getByText(/^\d{4,}$/).first();
    if (await expect(visibleNumber).toBeVisible({ timeout: 5000 }).then(() => true).catch(() => false)) {
      return (await visibleNumber.textContent())?.trim() || 'Not captured';
    }

    return 'Not captured';
  }

  static defaultUser() {
    return {
      password: HMB_DATA.common.password,
      email: HMB_DATA.common.primaryEmail,
    };
  }
}
