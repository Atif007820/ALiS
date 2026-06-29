import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { numberWithDigitLength, ssn } from '../utils/randomData.js';

export class NvrcpStrategy extends BaseStrategy {
  refreshUser(product, user) {
    super.refreshUser(product, user);

    if (product.formType === 'person') {
      user.ssn = ssn();
      user.ssnTin = ssn();
      user.apiNumber = `API${numberWithDigitLength(4)}`;
      user.arrtNumber = numberWithDigitLength(9);
    }

    return user;
  }

  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();
    await this.form.click(await this.form.firstVisibleText(product.sectionText));
    await this.form.waitForLoginShell();

    const registrationLink = product.registrationLinkId
      ? this.page.locator(`#${product.registrationLinkId}`)
      : this.page.getByRole('link', { name: product.registrationLinkName });

    await this.form.click(registrationLink);
    await expect(this.page.locator('body')).toContainText(/Facility Name|Last Name|Login Name/i);
    await this.waitForRegistrationFields(product);
  }

  async fillRegistration(product, user) {
    if (product.formType === 'facility') {
      await this.form.fillFirstText(['Facility Name'], user.facilityName, { hard: true });
      await this.form.fillFirstText(['DBA / Business Name'], user.facilityName, { hard: true, timeout: 2000 });
      await this.form.fillFirstText(['NV Business ID'], user.nvBusinessIdShort, { hard: true });
      await this.form.fillFirstText(['Local License #', 'Local License'], user.localLicense, { hard: true });
      await this.form.selectFirst(['Facility Type'], user.facilityType);
    } else {
      await this.form.fillFirstText(['Last Name'], user.lastName, { hard: true });
      await this.form.fillFirstText(['First Name'], user.firstName, { hard: true });
      await this.form.fillFirstText(['SSN'], user.ssn, { hard: true });
      await this.form.fillFirstText(['API#', 'API #'], user.apiNumber, { hard: true });
      await this.form.fillFirstText(['ARRT, NMTCB, and/or CMA'], user.arrtNumber, { hard: true });
    }

    await this.form.fillAddress(user, { includeFax: false });
  }

  async waitForRegistrationFields(product) {
    await this.form.waitForReady();

    const primaryField = product.formType === 'facility'
      ? this.page.getByRole('textbox', { name: /Facility Name\s*\*?/i }).first()
      : this.page.getByRole('textbox', { name: /Last Name\s*\*?/i }).first();

    await expect(primaryField).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({ timeout: 30000 });
  }
}
