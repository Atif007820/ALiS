import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';

export class DpbhStrategy extends BaseStrategy {
  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.dismissOptionalStartupNotice();
    await this.form.waitForLoginShell();
    await this.selectStartupBusinessUnit(product);

    if (product.tabSelector) {
      await this.form.click(this.page.locator(product.tabSelector));
    } else {
      await this.form.click(await this.form.firstVisibleText(product.sectionText));
    }

    await this.form.waitForLoginShell();
    await this.form.click(this.page.locator(`#${product.registrationLinkId}`));
    await expect(this.page.locator('body')).toContainText(/Facility Name|Last Name|Login Name/i);
    await this.waitForRegistrationFields(product);
  }

  async dismissOptionalStartupNotice() {
    await this.form.waitForReady();

    const loginShellVisible = await this.page.getByRole('row', { name: /USER LOGIN\s+Login Name/ })
      .first()
      .isVisible()
      .catch(() => false);
    if (loginShellVisible) return;

    const noticeLink = this.page.getByRole('link', { name: /dpbh\.nv\.gov\/Reg\/CLICS/i }).first();
    const doNotShowCheckbox = this.page.getByRole('checkbox', { name: /Please do not show this/i }).first();
    const noticeVisible = await noticeLink.isVisible({ timeout: 1500 }).catch(() => false)
      || await doNotShowCheckbox.isVisible({ timeout: 1500 }).catch(() => false);

    if (!noticeVisible) return;

    if (await doNotShowCheckbox.isVisible().catch(() => false)) {
      await doNotShowCheckbox.check().catch(() => {});
    }

    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await this.form.waitForReady();
  }

  async selectStartupBusinessUnit(product) {
    const modal = this.page.locator('#myModal').first();
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
    if (!modalVisible) return;

    const businessUnit = businessUnitForProduct(product);
    await this.form.selectOption(modal.getByRole('combobox', { name: /Business Unit/i }), businessUnit);
    const ok = modal.getByRole('link', { name: /^OK$/i }).or(modal.getByRole('button', { name: /^OK$/i })).first();
    await ok.click({ force: true, noWaitAfter: true, timeout: 10000 }).catch(async () => {
      await this.page.evaluate(() => {
        if (typeof window.__doPostBack === 'function') {
          window.__doPostBack('btnOk', '');
          return;
        }

        document.querySelector('#btnOk')?.click();
      });
    });
    await modal.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.form.waitForReady();
  }

  async fillRegistration(product, user) {
    if (product.formType === 'facility') {
      await this.form.fillFirstText(['Facility Name (DBA Name)', 'Facility Name'], user.facilityName, { hard: true, required: true });
      await this.form.fillFirstText([/Registered Name with/i, /Registered Name/i], user.facilityName, { hard: true });
      await this.form.fillFirstText(['NV Business ID'], user.nvBusinessId, { hard: true, required: true });
    } else {
      await this.form.fillFirstText(['Last Name'], user.lastName, { hard: true, required: true });
      await this.form.fillFirstText(['First Name'], user.firstName, { hard: true, required: true });
      await this.form.fillDateOfBirth(user.dob);
      await this.form.fillFirstText(['SSN/TIN', 'SSN', 'TIN'], user.ssnTin, { hard: true, required: true });
    }

    await this.form.fillFirstText(['Contact Person'], user.contactPerson, { hard: true });
    await this.form.fillAddress(user, { includeFax: true });
  }

  async waitForRegistrationFields(product) {
    await this.form.waitForReady();
    const primaryField = product.formType === 'facility'
      ? this.page.getByRole('textbox', { name: /Facility Name/i }).first()
      : this.page.getByRole('textbox', { name: /Last Name/i }).first();

    await expect(primaryField).toBeVisible({ timeout: 30000 });
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({ timeout: 30000 });
  }
}

function businessUnitForProduct(product) {
  if (['CCFL', 'CCFD'].includes(product.key)) return 'Child Care';
  if (['CBA', 'TP'].includes(product.key)) return 'Environmental Health';
  return 'Health Care Quality & Compliance';
}
