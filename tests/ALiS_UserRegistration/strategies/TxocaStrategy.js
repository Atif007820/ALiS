import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { entityName, phone, simplePerson, ssn, street, timestampParts, unit, city, zip, numberWithDigitLength } from '../utils/randomData.js';

export class TxocaStrategy extends BaseStrategy {
  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();
    await this.selectStartupProgram(product);
    await this.selectProductTab(product);
    await this.clickRegistrationLink(product);
    await expect(this.page.locator('body')).toContainText(
      /Initial User Registration|Registration|Online Account|Login Name/i,
      { timeout: 30000 },
    );
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({ timeout: 30000 });
  }

  async selectProductTab(product) {
    if (product.tabSelector) {
      const tabBySelector = this.page.locator(product.tabSelector).first();
      if (await tabBySelector.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.form.click(tabBySelector);
        return;
      }
    }

    if (product.tabClickText) {
      await this.form.click(this.page.getByText(product.tabClickText, { exact: true }).first());
      return;
    }

    const tab = this.page.locator('.ajax__tab_tab').filter({ hasText: new RegExp(`^${escapeRegex(product.tabText)}$`, 'i') }).first();

    await this.form.click(tab);
  }

  async registrationLink(product) {
    if (product.registrationRowText) {
      const byConfiguredRow = this.rowRegistrationLink(product.registrationRowText);
      if (await byConfiguredRow.isVisible({ timeout: 3000 }).catch(() => false)) return byConfiguredRow;
    }

    const byId = this.page.locator(`#${product.registrationLinkId}`).first();
    if (await byId.isVisible({ timeout: 3000 }).catch(() => false)) return byId;

    const rowText = product.registrationRowText || product.name;
    const byRowText = this.rowRegistrationLink(rowText);

    if (await byRowText.isVisible({ timeout: 3000 }).catch(() => false)) return byRowText;

    return byId;
  }

  rowRegistrationLink(rowText) {
    return this.page
      .locator(`xpath=//a[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'click here') and contains(normalize-space(ancestor::tr[1]), ${xpathLiteral(rowText)})]`)
      .first();
  }

  async clickRegistrationLink(product) {
    const link = await this.registrationLink(product);
    const postBackTarget = await link.evaluate((anchor) => {
      const href = anchor.getAttribute('href') || '';
      return href.match(/__doPostBack\('([^']+)'/)?.[1]
        || href.match(/WebForm_PostBackOptions\("([^"]+)"/)?.[1]
        || '';
    }).catch(() => '');

    if (postBackTarget) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      const registrationUrl = this.page.waitForURL(/(?:InitialUserRegistration|Registration)\.aspx/i, { timeout: 30000 }).catch(() => null);
      await this.page.evaluate((target) => {
        if (typeof window.__doPostBack === 'function') {
          window.__doPostBack(target, '');
          return;
        }

        document.querySelector(`a[href*="${CSS.escape(target)}"]`)?.click();
      }, postBackTarget);
      await registrationUrl;
      await this.form.waitForReady();
      return;
    }

    await this.form.click(link);
  }

  async selectStartupProgram(product) {
    const modal = this.page.locator('#myModal').first();
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
    if (!modalVisible) return;

    await this.form.selectOption(modal.getByRole('combobox', { name: /Please choose the Program|Program/i }), programForProduct(product));
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
    if (await this.isSuccessful(product, user) && !(await this.form.isRegistrationFormOpen())) return;

    const firstNameFields = ['First Name', 'Given Name'];
    const lastNameFields = ['Last Name', 'Surname'];
    const programFields = ['Program Name', 'Entity Name', 'Business Name', 'Company Name', 'Organization Name', 'Firm Name', 'Legal Name'];
    const hasFirstName = await this.hasTextField(firstNameFields);
    const hasProgramName = await this.hasTextField(programFields);

    if (hasFirstName) {
      await this.form.fillFirstText(firstNameFields, user.firstName, { hard: true, required: true });
      await this.form.fillFirstText(lastNameFields, user.lastName, { hard: true, required: true });
      await this.form.fillFirstText(programFields, user.entityName, { hard: true });
    } else if (hasProgramName) {
      await this.form.fillFirstText(programFields, user.entityName, { hard: true, required: true });
    } else {
      throw new Error(`TXOCA registration form did not expose first/given name or program name fields for ${product.key}.`);
    }

    await this.form.fillFirstText(['Email ID', 'Email', 'E-mail', 'Primary E-mail'], user.email, { hard: true, required: true });
    await this.form.fillFirstText(['Alt Email', 'Alternate E-mail', 'Alternate Email'], user.altEmail);
    await this.form.fillFirstText(['Address', 'Street One', 'Street 1', 'Address Line 1'], user.streetOne, { hard: true, required: true });
    await this.form.fillFirstText(['Street Two', 'Street 2', 'Address Line 2', 'Suite/Apt/Unit/etc.'], user.streetTwo, { hard: true });
    await this.form.fillFirstText(['City'], user.city, { hard: true, required: true });
    await this.form.selectFirst(['State', 'State/Province'], 'TX', { required: true });

    const zipFilled = await this.form.fillFirstText(['Zip', 'Zip Code', 'Postal Code'], user.zip, { hard: true, required: true });
    if (zipFilled) {
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.form.waitForReady();
    }

    await this.form.selectRandomCounty({ required: true });
    if (!(await this.form.fillPrimaryPhone(user))) {
      throw new Error('Required primary phone field was not available.');
    }
    await this.form.fillFirstText(['Fax'], user.fax);
    if (hasFirstName) await this.form.fillDateOfBirth(user.date);
  }

  async hasTextField(names, timeout = 2000) {
    const deadline = Date.now() + timeout;

    while (Date.now() <= deadline) {
      for (const name of names) {
        const pattern = name instanceof RegExp ? name : new RegExp(`^${escapeRegex(name)}\\s*\\*?$`, 'i');
        const locators = [
          this.page.getByRole('textbox', { name: pattern }),
          this.page.getByLabel(pattern),
        ];

        for (const locator of locators) {
          if (await this.form.firstUsable(locator)) return true;
        }
      }

      await this.page.waitForTimeout(200);
    }

    return false;
  }

  refreshUser(product, user) {
    const person = simplePerson();
    const nextCity = city();
    user.firstName = person.firstName;
    user.lastName = person.lastName;
    user.fullName = `${person.firstName} ${person.lastName}`;
    user.contactPerson = user.fullName;
    user.entityName = entityName(product.entityPrefix || product.key);
    user.facilityName = user.entityName;
    user.streetOne = street(nextCity);
    user.streetTwo = unit();
    user.city = nextCity;
    user.zip = zip();
    user.phone = phone();
    user.phoneExt = numberWithDigitLength(3);
    user.primaryPhone = phone();
    user.userPhone = phone();
    user.businessPhone = phone();
    user.fax = phone();
    user.ssn = ssn();
    user.ssnTin = ssn();
    user.date = timestampParts().dateForField;
    user.dob = user.date;
    return user;
  }

  async isSuccessful() {
    const bodyText = await this.form.bodyText();
    if (/Welcome|Logout|Dashboard|Application for New|Application Preliminary|successfully registered/i.test(bodyText)) {
      return true;
    }
    return /\/Protected\/|\/Dashboard/i.test(this.page.url());
  }
}

function programForProduct(product) {
  if (product.program) return product.program;
  if (product.key === 'CR') return 'Court Reporter Certification';
  if (product.key === 'PS') return 'Process Server Certification';
  if (product.key === 'CI') return 'Licensed Court Interpreter';
  return 'Guardians';
}

function xpathLiteral(value) {
  const text = String(value);
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  return `concat(${text.split("'").map((part) => `'${part}'`).join(', "\"\'\"", ')})`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
