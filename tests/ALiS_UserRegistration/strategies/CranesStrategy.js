import { BaseStrategy } from './BaseStrategy.js';
import { editableData } from '../config/editableData.js';

export class CranesStrategy extends BaseStrategy {
  async openRegistration(product, user) {
    await this.disableAutocomplete();
    await this.page.goto(this.site.loginUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await this.form.waitForLoginShell();
    await this.page.locator('#m_LoginControl_LinkButton2').click({ timeout: 30000 });
    await this.selectByLabel('Business Unit', editableData.cranes.businessUnit);
    await this.selectByLabel('Please select your role', editableData.cranes.role);
    await this.fillText(this.page.getByRole('textbox', { name: 'General Contractor License#' }), user.gclNumber);
    await this.fillText(this.page.getByRole('textbox', { name: 'Crane Owner ID' }), user.craneOwnerId);

    await Promise.all([
      this.page.getByRole('heading', { name: 'Initial User Registration -' }).waitFor({ state: 'visible', timeout: 60000 }),
      this.page.getByRole('button', { name: 'Next' }).click(),
    ]);
  }

  async fillRegistration(product, user) {
    await this.form.clearInputs();
    await this.fillText(this.page.getByRole('textbox', { name: 'Entity Name' }), user.entityName);
    await this.fillText(this.page.getByRole('textbox', { name: 'UBI #' }), user.ubiNumber);
    await this.fillText(this.page.locator('#txtFirstNameBE'), editableData.businessContactFirstName);
    await this.fillText(this.page.locator('#txtLastNameBE'), editableData.businessContactLastName);
    await this.fillText(this.page.locator('#Email'), user.email);
    await this.fillText(this.page.locator('#txtPhone'), user.businessPhone);
    await this.selectByLabel('Country', user.country);
    await this.fillText(this.page.getByRole('textbox', { name: 'Address' }), user.streetOne);
    await this.fillText(this.page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }), user.streetTwo);
    await this.fillText(this.page.getByRole('textbox', { name: 'City' }), user.city);
    await this.selectByLabel('State/Province', user.state);
    await this.fillText(this.page.getByRole('textbox', { name: 'Zip' }), user.zip);
    await this.form.selectRandomCounty({ required: true });
    await this.fillText(this.page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), user.primaryPhone);
    await this.fillText(this.page.getByRole('textbox', { name: 'Fax' }), user.fax);
    await this.fillText(this.page.getByRole('textbox', { name: 'Primary E-mail' }), user.email);
    await this.fillText(this.page.getByRole('textbox', { name: 'Alternate E-mail' }), user.altEmail);
  }

  async fillAccount(user) {
    await this.fillText(this.page.locator('#txtLastName'), user.lastName);
    await this.fillText(this.page.locator('#txtFirstName'), user.firstName);
    await this.fillText(this.page.getByPlaceholder('E-mail'), user.email);
    await this.fillText(this.page.locator('#txtUserPhone'), user.userPhone);
    await this.page.getByRole('checkbox', { name: 'I have read and agree to the' })
      .check({ force: true, timeout: 10000 });
    await this.fillText(this.page.getByRole('textbox', { name: 'Name*', exact: true }), user.fullName);
    await this.fillText(this.page.getByRole('textbox', { name: 'Login Name*' }), user.loginName);
    await this.fillText(this.page.getByRole('textbox', { name: 'Password*' }), user.password);
    await this.fillText(this.page.getByRole('textbox', { name: 'Re-type Password *' }), user.password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Register' }).click();
  }

  async isSuccessful() {
    await this.page.getByText(/You have successfully registered|successfully registered/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    return /You have successfully registered|successfully registered/i.test(await this.form.bodyText());
  }

  async disableAutocomplete() {
    await this.page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input, textarea')
          .forEach((element) => element.setAttribute('autocomplete', 'off'));
      });
    });
  }

  async selectByLabel(label, value) {
    const control = this.page.getByLabel(label, { exact: true }).first();
    await control.waitFor({ state: 'visible', timeout: 30000 });
    await control.selectOption(value);
  }

  async fillText(locator, value) {
    await this.form.fillHard(locator.first(), value);
  }
}
