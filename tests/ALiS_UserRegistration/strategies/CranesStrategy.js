import { errors, expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { editableData } from '../config/editableData.js';
import { logger } from '../utils/logger.js';

const registeredMessage = /successfully\s+registered|registered\s+successfully/i;
const approvalMessage = /company administrator reviews your request for access/i;
const approvalOutcome = 'Submitted - pending company administrator approval';

export class CranesStrategy extends BaseStrategy {
  async openRegistration(product, user) {
    await this.disableAutocomplete();
    const response = await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (response && response.status() >= 400) {
      throw new Error(`Cranes login URL returned HTTP ${response.status()}: ${this.site.loginUrl}. Check config/urls.js and version overrides.`);
    }
    await this.form.waitForLoginShell();
    await this.dismissInactiveDialog();
    await this.openPreliminaryRegistration();
    const role = this.selectLocator('Please select your role');
    const generalLicense = this.page.getByRole('textbox', { name: 'General Contractor License#' });
    const craneOwner = this.page.getByRole('textbox', { name: 'Crane Owner ID' });
    await this.selectByLabel('Business Unit', editableData.cranes.businessUnit, {
      ready: async () => await role.isVisible() && await role.isEnabled()
        && await role.evaluate((select, value) => Array.from(select.options).some((option) => option.value === value && !option.disabled), editableData.cranes.role),
    });
    await this.selectByLabel('Please select your role', editableData.cranes.role, {
      ready: async () => await generalLicense.isVisible() && await craneOwner.isVisible(),
    });
    await this.fillText(generalLicense, user.gclNumber);
    await this.fillText(craneOwner, user.craneOwnerId);

    await this.dismissInactiveDialog();
    await this.page.getByRole('button', { name: 'Next' }).click({ noWaitAfter: true });
    await this.page.getByRole('heading', { name: /Initial User Registration/i })
      .waitFor({ state: 'visible', timeout: 60000 });
    await expect(this.page.getByRole('textbox', { name: 'Entity Name' })).toBeVisible({ timeout: 60000 });
  }

  async fillRegistration(product, user) {
    const entity = await this.registrationSection('Entity Information');
    user.entityName = await this.fillText(this.textLocator(entity, 'Entity Name'), user.entityName);
    user.facilityName = user.entityName;
    user.ubiNumber = await this.fillText(this.textLocator(entity, 'UBI #'), user.ubiNumber);
    await this.fillText(this.textLocator(entity, 'First Name'), editableData.businessContactFirstName);
    await this.fillText(this.textLocator(entity, 'Last Name'), editableData.businessContactLastName);
    await this.fillText(this.textLocator(entity, 'Email'), user.email);
    await this.fillText(this.phoneLocator(entity, 'Phone'), user.businessPhone);
    const state = this.selectLocator('State/Province');
    user.country = await this.selectByLabel('Country', user.country, {
      preserveLocked: true,
      ready: async () => await state.isVisible() && (
        await state.isEnabled()
          ? await state.evaluate((select, value) => Array.from(select.options).some((option) => option.value === value && !option.disabled), user.state)
          : await this.form.hasSelectedNonPlaceholderOption(state)
      ),
    });
    await this.fillText(this.page.getByRole('textbox', { name: 'Address' }), user.streetOne);
    await this.fillText(this.page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }), user.streetTwo, { required: false });
    await this.fillText(this.page.getByRole('textbox', { name: 'City' }), user.city);
    const county = this.selectLocator('County');
    user.state = await this.selectByLabel('State/Province', user.state, {
      preserveLocked: true,
      ready: async () => await county.isVisible() && (
        await county.isEnabled()
          ? (await this.form.availableSelectOptions(county)).length > 0
          : await this.form.hasSelectedNonPlaceholderOption(county)
      ),
    });
    await this.fillText(this.page.getByRole('textbox', { name: 'Zip' }), user.zip);
    if (await county.isEnabled()) await this.form.selectRandomCounty({ required: true });
    else if (!(await this.form.hasSelectedNonPlaceholderOption(county))) {
      throw new Error('Locked Cranes County dropdown has no selected value.');
    }
    await this.fillText(this.page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), user.primaryPhone);
    await this.fillText(this.page.getByRole('textbox', { name: 'Fax' }), user.fax, { required: false });
    await this.fillText(this.page.getByRole('textbox', { name: 'Primary E-mail' }), user.email);
    await this.fillText(this.page.getByRole('textbox', { name: 'Alternate E-mail' }), user.altEmail, { required: false });
  }

  async fillAccount(user) {
    const details = await this.registrationSection('User Detail');
    await this.fillText(this.textLocator(details, 'Last Name'), user.lastName);
    await this.fillText(this.textLocator(details, 'First Name'), user.firstName);
    await this.fillText(this.textLocator(details, 'Email'), user.email);
    await this.fillText(this.phoneLocator(details, 'Phone # - Ext'), user.userPhone);
    await this.page.getByRole('checkbox', { name: 'I have read and agree to the' })
      .check({ force: true, timeout: 10000 });
    await this.fillText(this.page.getByRole('textbox', { name: 'Name*', exact: true }), user.fullName);
    await this.fillText(this.page.getByRole('textbox', { name: 'Login Name*' }), user.loginName);
    await this.fillText(this.page.getByRole('textbox', { name: 'Password*' }), user.password);
    await this.fillText(this.page.getByRole('textbox', { name: 'Re-type Password *' }), user.password);
  }

  async submit() {
    await this.dismissInactiveDialog();
    await this.page.getByRole('button', { name: 'Register' }).click({ timeout: 30000 });
  }

  async isSuccessful() {
    await this.page.getByText(registeredMessage)
      .or(this.page.getByText(approvalMessage))
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    if (await this.form.isRegistrationFormOpen()) return false;
    const text = await this.form.bodyText();
    if (registeredMessage.test(text)) return true;

    const successPage = /\/SuccessPage(?:\.aspx)?\/?$/i.test(new URL(this.page.url()).pathname);
    const returnToLogin = this.page.getByRole('button', { name: /Return to Login/i })
      .or(this.page.getByRole('link', { name: /Return to Login/i })).first();
    const pendingApproval = successPage && approvalMessage.test(text)
      && /Once your registration is complete, you will receive an email notification/i.test(text)
      && await returnToLogin.isVisible();
    if (!pendingApproval) return false;

    if (this.registrationOutcome !== approvalOutcome) {
      this.registrationOutcome = approvalOutcome;
      this.testInfo?.annotations?.push({ type: 'Registration Outcome', description: approvalOutcome });
      logger.info(approvalOutcome);
    }
    return true;
  }

  async shouldRetryWhenFormStillOpen() {
    if (await this.form.isRegistrationFormOpen()) return true;
    throw new Error(`Cranes registration did not reach a confirmed success or pending-approval page. URL=${this.page.url()}`);
  }

  async disableAutocomplete() {
    await this.page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input, textarea')
          .forEach((element) => element.setAttribute('autocomplete', 'off'));
      });
    });
  }

  async openPreliminaryRegistration() {
    const registrationLink = this.page.getByRole('row', { name: /^Sign Up for New User\s*:\s*Click Here$/i })
      .getByRole('link', { name: /^Click Here$/i });
    await registrationLink.click({ noWaitAfter: true, timeout: 30000 });
    await this.page.waitForURL(/UserRegistrationPrelim/i, {
      timeout: 60000,
      waitUntil: 'commit',
    });
    await this.waitForPreliminaryPage();
  }

  async waitForPreliminaryPage() {
    const businessUnit = this.selectLocator('Business Unit');
    await expect.poll(async () => {
      await this.dismissInactiveDialog();
      return await businessUnit.isVisible() && await businessUnit.isEnabled();
    }, {
      timeout: 60000,
      message: `Cranes preliminary registration did not expose an enabled Business Unit. URL=${this.page.url()}`,
    }).toBe(true);
  }

  selectLocator(label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const name = new RegExp(`^${escaped}\\s*\\*?$`, 'i');
    return this.page.getByRole('combobox', { name })
      .or(this.page.getByLabel(name)).filter({ visible: true }).first();
  }

  async registrationSection(title, { timeout = 30000 } = {}) {
    const name = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const section = this.page.getByRole('region', { name })
      .or(this.page.getByRole('group', { name }))
      .or(this.page.locator('section, fieldset').filter({ has: this.page.getByRole('heading', { name }) }))
      .filter({ visible: true });
    await expect(section, `Expected one visible Cranes "${title}" section.`).toHaveCount(1, { timeout });
    return section;
  }

  textLocator(section, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return section.getByRole('textbox', { name: new RegExp(`^${escaped}\\s*\\*?$`, 'i') });
  }

  phoneLocator(section, label) {
    // Phone and extension share an accessible label; the extension has a native form name.
    return this.textLocator(section, label).and(section.locator('input:not([name="Extension" i])'));
  }

  async dismissInactiveDialog() {
    const dialog = this.page.getByRole('dialog')
      .or(this.page.getByRole('alertdialog'))
      .or(this.page.getByRole('alert'))
      .filter({ hasText: /Are you still there\s*\?/i, visible: true });
    if (!(await dialog.count())) return;
    await expect(dialog, 'Expected one visible Cranes inactivity dialog.').toHaveCount(1, { timeout: 10000 });
    const button = dialog.getByRole('button', { name: /^Yes$/i });
    await button.click({ timeout: 10000 });
    await expect(dialog).toBeHidden({ timeout: 10000 });
  }

  async selectByLabel(label, value, { preserveLocked = false, ready, timeout = 10000 } = {}) {
    const control = this.selectLocator(label);
    const expected = String(value ?? '');
    if (!expected) throw new Error(`Cranes ${label} has no configured selection.`);
    await expect(control).toBeVisible({ timeout: 30000 });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.dismissInactiveDialog();
      if (preserveLocked && !(await control.isEnabled())) {
        if (!(await this.form.hasSelectedNonPlaceholderOption(control))) {
          await expect.poll(async () => await control.isEnabled()
            || await this.form.hasSelectedNonPlaceholderOption(control), {
            timeout: Math.min(timeout, 5000),
          }).toBe(true).catch(() => {});
        }
      }
      if (preserveLocked && !(await control.isEnabled())) {
        if (await this.form.hasSelectedNonPlaceholderOption(control)) return control.inputValue();
        throw new Error(`Locked Cranes ${label} dropdown has no selected value.`);
      }
      try {
        // Exact-option auto-wait and fresh locators handle delayed lists and DOM replacement.
        await control.selectOption(expected, { timeout });
        await this.form.waitForAspNetIdle();
        await expect.poll(async () => {
          await this.dismissInactiveDialog();
          if (!(await control.isVisible())) return false;
          return await control.inputValue() === expected && (!ready || await ready());
        }, { timeout, intervals: [100, 250, 500] }).toBe(true);
        return expected;
      } catch (error) {
        if (this.page.isClosed()) throw error;
        if (attempt === 3) {
          const actual = await control.inputValue().catch(() => '(unavailable)');
          throw new Error(`Cranes ${label} did not keep configured value "${expected}" or load its dependent fields. Actual="${actual}". URL=${this.page.url()}`, { cause: error });
        }
      }
    }
  }

  async fillText(locator, value, { required = true, timeout = required ? 30000 : 5000 } = {}) {
    await this.dismissInactiveDialog();
    const target = locator.filter({ visible: true });
    const visible = await target.waitFor({ state: 'visible', timeout }).then(() => true).catch((error) => {
      if (required || this.page.isClosed() || !(error instanceof errors.TimeoutError)) throw error;
      return false;
    });
    if (!visible) {
      logger.info(`Skipped unavailable optional Cranes text field: ${locator}.`);
      return null;
    }
    if (required && !(await target.isEditable()) && !(await target.inputValue()).trim()) {
      await expect.poll(async () => await target.isEditable() || Boolean((await target.inputValue()).trim()), {
        timeout: Math.min(timeout, 5000),
      }).toBe(true).catch(() => {});
    }
    if (!(await target.isEditable())) {
      const actual = await target.inputValue();
      if (required && !actual.trim()) {
        const label = await target.getAttribute('aria-label') || await target.getAttribute('id') || 'text field';
        throw new Error(`Locked Cranes ${label} field has no value. Check the preliminary registration details.`);
      }
      return actual;
    }
    await target.fill(String(value));
    await expect(target).toHaveValue(String(value), { timeout });
    return target.inputValue();
  }
}
