import { BasePage } from './BasePage.js';

export class RegistrationPage extends BasePage {
  async waitForLoginShell() {
    await this.page.getByRole('row', { name: /USER LOGIN\s+Login Name/ }).first().waitFor({ state: 'visible' });
  }

  async fillAddress(user, { includeState = false, stateValue = user.state, includeFax = true, countyValue = user.preferredCounty } = {}) {
    await this.fillFirstText(['Street One', 'Street 1', 'Address Line 1', 'Address'], user.streetOne, { hard: true, required: true });
    await this.fillFirstText(['Street Two', 'Street 2', 'Address Line 2', 'Suite/Apt/Unit/etc.'], user.streetTwo, { hard: true });
    await this.fillFirstText(['City'], user.city, { hard: true, required: true });

    if (includeState) {
      await this.selectFirst(['State', 'State/Province'], stateValue, { required: true });
    }

    const zipFilled = await this.fillFirstText(['Zip', 'Zip Code', 'Postal Code'], user.zip, { hard: true, required: true });
    if (zipFilled) {
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.waitForReady();
    }

    await this.selectCounty(countyValue, { required: true });
    if (!(await this.fillPrimaryPhone(user))) {
      throw new Error('Required primary phone field was not available.');
    }
    await this.fillAlternatePhone(user);
    if (includeFax) await this.fillFirstText(['Fax'], user.fax);
    if (!(await this.fillPrimaryEmail(user.email))) {
      throw new Error('Required primary email field was not available.');
    }
    await this.fillAlternateEmail(user.altEmail);
  }

  async fillAccount(user, passwordNames = [/^Password\s*\*?$/i, /^Password$/i]) {
    await this.fillFirstText(['Login Name'], user.loginName, { hard: true, required: true });
    await this.fillFirstText(passwordNames, user.password, { hard: true, required: true });
    await this.fillFirstText(['Re-type Password', 'Re-type Password *', 'Confirm Password'], user.password, { hard: true, required: true });
  }

  async submit() {
    const register = this.page.getByRole('link', { name: /^Register$/i })
      .or(this.page.getByRole('button', { name: /^Register$/i }))
      .or(this.page.getByRole('link', { name: /^Submit$/i }))
      .or(this.page.getByRole('button', { name: /^Submit$/i }))
      .first();

    await this.click(register);
  }

  async validationText() {
    const validationText = await this.page
      .locator('li, .validation-summary-errors, .field-validation-error, [id*="ValidationSummary"], [id*="valSummary"], [id*="RequiredFieldValidator"], [id*="RegularExpressionValidator"]')
      .evaluateAll((elements) => elements.map((element) => element.textContent ?? '').join('\n'))
      .catch(() => '');

    const scopedValidation = validationText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /required|invalid|does not match|already|unique|taken|must select|please enter/i.test(line))
      .filter((line) => !/Fields marked|Password is case sensitive/i.test(line))
      .join(' ');

    if (scopedValidation) return scopedValidation;

    const bodyText = await this.bodyText();
    const knownPageValidation = bodyText.match(
      /Information provided by you does not match with our record[^.\n]*(?:\.[^.\n]*)?/i,
    );

    return knownPageValidation?.[0]?.trim() || '';
  }

  async bodyText() {
    return this.page.evaluate(() => Array.from(document.querySelectorAll('body'))
      .map((element) => element.innerText || '')
      .join('\n')).catch(() => '');
  }

  async bodyHtml() {
    return this.page.evaluate(() => Array.from(document.querySelectorAll('body'))
      .map((element) => element.innerHTML || '')
      .join('\n')).catch(() => '');
  }

  async isDuplicateLoginVisible() {
    return /login name.*(already|exists|unique|taken)|already.*login name/i.test(await this.bodyText());
  }

  async duplicateProfileText() {
    const combined = `${await this.bodyText()}\n${await this.bodyHtml()}`;
    return /profile with this data already exists|another profile cannot be created|data already exists/i.test(combined)
      ? 'Profile with this data already exists.'
      : '';
  }

  async isRegistrationFormOpen() {
    const register = this.page.getByRole('link', { name: /^Register$/i })
      .or(this.page.getByRole('button', { name: /^Register$/i }))
      .first();
    const loginName = this.page.getByRole('textbox', { name: /Login Name\s*\*/i }).first();
    return await register.isVisible().catch(() => false)
      && await loginName.isVisible().catch(() => false);
  }

  async fillDateOfBirth(value) {
    const filled = await this.fillFirstText(['DOB', 'Date of Birth', 'Birth Date'], value);
    if (filled) return true;

    const calendarButton = this.page.getByRole('button', { name: /CalenderImage|Calendar/i }).first();
    if (!(await calendarButton.count().catch(() => 0)) || !(await calendarButton.isVisible().catch(() => false))) {
      return false;
    }

    const popupPromise = this.page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
    await calendarButton.click({ noWaitAfter: true });
    const popup = await popupPromise;

    if (popup) {
      await popup.getByRole('button', { name: /^OK$/i }).click({ timeout: 10000 }).catch(async () => {
        await popup.locator('input[type="submit"], button').last().click();
      });
      await popup.close().catch(() => {});
    }

    await this.waitForReady();
    return true;
  }
}
