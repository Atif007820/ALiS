import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { ssn } from '../utils/randomData.js';

export class SaptaStrategy extends BaseStrategy {
  constructor(context) {
    super(context);
    this.optionalPopup = null;
  }

  buildUser(product) {
    const user = super.buildUser(product);
    user.providerName = user.entityName;
    user.preferredCounty = product.preferredCounty || user.preferredCounty || '';

    if (product.formType === 'detox') {
      user.dob = randomAdultDob();
      user.ssn = ssn();
    }

    return user;
  }

  refreshUser(product, user) {
    super.refreshUser(product, user);
    user.providerName = user.entityName;
    user.preferredCounty = product.preferredCounty || user.preferredCounty || '';

    if (product.formType === 'detox') {
      user.dob = randomAdultDob();
      user.ssn = ssn();
    }

    return user;
  }

  async openRegistration(product) {
    this.optionalPopup = null;

    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();
    await this.form.click(await this.form.firstVisibleText(product.sectionText));
    await this.form.waitForLoginShell();

    const popupPromise = product.optionalPopup
      ? this.page.waitForEvent('popup', { timeout: 8000 }).catch(() => null)
      : Promise.resolve(null);

    await this.form.click(this.page.locator(`#${product.registrationLinkId}`));
    this.optionalPopup = await popupPromise;

    await expect(this.page.locator('body')).toContainText(/Provider Name|Last Name|First Name|SSN|Login Name/i);
    await this.waitForRegistrationFields(product);
  }

  async fillRegistration(product, user) {
    if (product.formType === 'provider') {
      await this.form.fillFirstText(['Provider Name'], user.providerName, { hard: true, required: true });
      await this.form.fillFirstText(['NV Business ID'], user.nvBusinessId, { hard: true, required: true });
      await this.form.fillAddress(user, { includeFax: false, countyValue: user.preferredCounty });
      return;
    }

    await this.form.fillFirstText(['Last Name'], user.lastName, { hard: true, required: true });
    await this.form.fillFirstText(['First Name'], user.firstName, { hard: true, required: true });
    await this.dismissOptionalPopup();

    const dobFilled = await this.form.fillDateOfBirth(user.dob);
    if (!dobFilled) {
      await this.form.fillFirstText(['DOB', 'Date of Birth', 'Birth Date'], user.dob, { hard: true, required: true });
    }

    await this.form.fillFirstText(['SSN'], user.ssn, { hard: true, required: true });
    await this.form.fillFirstText(['Street One', 'Street 1', 'Address Line 1', 'Address'], user.streetOne, { hard: true, required: true });
    await this.form.fillFirstText(['Street Two', 'Street 2', 'Address Line 2', 'Suite/Apt/Unit/etc.'], user.streetTwo, { hard: true });
    await this.form.fillFirstText(['City'], user.city, { hard: true, required: true });

    const zipFilled = await this.form.fillFirstText(['Zip', 'Zip Code', 'Postal Code'], user.zip, { hard: true, required: true });
    if (zipFilled) {
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.form.waitForReady();
    }

    await this.form.selectCounty(user.preferredCounty, { required: true });

    if (!(await this.form.fillPrimaryPhone(user))) {
      throw new Error('Required primary phone field was not available.');
    }

    if (!(await this.form.fillPrimaryEmail(user.email))) {
      throw new Error('Required primary email field was not available.');
    }

    await this.form.fillAlternateEmail(user.altEmail);
  }

  async waitForRegistrationFields(product) {
    await this.form.waitForReady();

    const primaryField = product.formType === 'provider'
      ? this.page.getByRole('textbox', { name: /Provider Name\s*\*?/i }).first()
      : this.page.getByRole('textbox', { name: /Last Name\s*\*?/i }).first();

    await expect(primaryField).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({ timeout: 30000 });
  }

  async dismissOptionalPopup() {
    const popup = this.optionalPopup;
    if (popup && !popup.isClosed()) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      const ok = popup.getByRole('button', { name: /^OK$/i })
        .or(popup.getByRole('link', { name: /^OK$/i }))
        .first();

      if (await ok.isVisible({ timeout: 1500 }).catch(() => false)) {
        await ok.click({ noWaitAfter: true }).catch(() => {});
        await popup.close().catch(() => {});
        this.optionalPopup = null;
        await this.form.waitForReady();
        return true;
      }
    }

    const pageOk = this.page.getByRole('button', { name: /^OK$/i })
      .or(this.page.getByRole('link', { name: /^OK$/i }))
      .first();

    if (await pageOk.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.form.click(pageOk);
      this.optionalPopup = null;
      return true;
    }

    return false;
  }
}

function randomAdultDob() {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  const year = String(Math.floor(Math.random() * 30) + 1970);
  return `${month}/${day}/${year}`;
}
