import { BaseStrategy } from './BaseStrategy.js';
import { editableData } from '../config/editableData.js';
import { pick } from '../utils/randomData.js';

const SELECTORS = {
  initialRegistrationLink: '#m_LoginControl_LinkButton2',
  businessUnit: '#BusinessUnitCode',
  roleDesignation: '#ddlRoleDesgination',
  elevatorLicense: '#ElevatorLicense',
  generalLicense: '#GeneralLicense',
  prelimUbi: '#txtUBINumber',
  entityRole: '#ddlRole',
  accountLastName: '#txtLastName',
  accountFirstName: '#txtFirstName',
  accountEmail: '#txtEmail',
  accountPhone: '#txtUserPhone',
  attestationName: '#txtAttestationName',
  loginName: '#txtLoginName',
  password: '#txtPassword',
  confirmPassword: '#txtConfirmPassword',
  inactiveDialogButton: '#inactive-dialog-button',
};

export class ConvStrategy extends BaseStrategy {
  async openRegistration(product, user) {
    await this.disableAutocomplete();
    await this.page.goto(this.site.loginUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await this.openPreliminaryRegistration();
    await this.selectBusinessUnit(editableData.conv.businessUnit);
    await this.selectUserType(product, user);

    await Promise.all([
      this.page.getByRole('textbox', { name: 'Entity Name' }).waitFor({ state: 'visible', timeout: 60000 }),
      this.page.getByRole('button', { name: 'Next' }).click({ noWaitAfter: true }),
    ]);
    await this.form.waitForReady();
  }

  async fillRegistration(product, user) {
    await this.form.clearInputs();
    await this.fillText(this.page.getByRole('textbox', { name: 'Entity Name' }), user.entityName);

    if (product.key === 'CC') {
      await this.fillText(this.page.getByRole('textbox', { name: 'UBI #' }), user.ubiNumber);
    }

    await this.fillText(this.page.locator('#txtFirstNameBE'), editableData.businessContactFirstName);
    await this.fillText(this.page.locator('#txtLastNameBE'), editableData.businessContactLastName);
    await this.selectControl(this.page.locator(SELECTORS.entityRole), pick(editableData.conv.entityRoles), { required: true, label: 'Role' });
    await this.fillText(this.page.locator('#Email'), user.email);
    await this.fillText(this.page.locator('#txtPhone'), user.phone);
    await this.selectControl(this.page.locator('#CountryCode_MLG'), user.country, { required: true, label: 'Country' });
    await this.form.fillAddress(user, { includeState: true, countyValue: user.preferredCounty });
  }

  async fillAccount(user) {
    await this.fillText(this.page.locator(SELECTORS.accountLastName), user.lastName);
    await this.fillText(this.page.locator(SELECTORS.accountFirstName), user.firstName);
    await this.fillText(this.page.locator(SELECTORS.accountEmail), user.email);
    await this.fillText(this.page.locator(SELECTORS.accountPhone), user.userPhone);
    await this.page.getByRole('checkbox', { name: 'I have read and agree to the' })
      .check({ force: true, timeout: 10000 });
    await this.fillText(this.page.locator(SELECTORS.attestationName), user.fullName);
    await this.fillText(this.page.locator(SELECTORS.loginName), user.loginName);
    await this.fillText(this.page.locator(SELECTORS.password), user.password);
    await this.fillText(this.page.locator(SELECTORS.confirmPassword), user.password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Register' }).click();
  }

  async isSuccessful() {
    await this.page.getByText(/processing time while your company|successfully registered/i)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    return /processing time while your company|successfully registered/i.test(await this.form.bodyText());
  }

  async disableAutocomplete() {
    await this.page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('input, textarea')
          .forEach((element) => element.setAttribute('autocomplete', 'off'));
      });
    });
  }

  async selectUserType(product, user) {
    if (product.key === 'CC') {
      await this.page.getByRole('radio', { name: 'Conveyance Contractor' }).check();
      await this.selectControl(this.page.locator(SELECTORS.roleDesignation), pick(editableData.conv.roles.CC), { required: true, label: 'Please select your role' });
      await this.fillText(this.page.locator(SELECTORS.elevatorLicense), user.eclNumber);
      await this.fillText(this.page.locator(SELECTORS.generalLicense), user.gclNumber);
      return;
    }

    if (product.key === 'BO') {
      await this.page.getByRole('radio', { name: 'Building Owner' }).check();
      await this.selectControl(this.page.locator(SELECTORS.roleDesignation), pick(editableData.conv.roles.BO), { required: true, label: 'Please select your role' });
      await this.fillText(this.page.locator(SELECTORS.prelimUbi), user.ubiNumber);
      return;
    }

    await this.page.getByRole('radio', { name: 'Property Manager' }).check();
    await this.selectControl(this.page.locator(SELECTORS.roleDesignation), pick(editableData.conv.roles.PM), { required: true, label: 'Please select your role' });
    await this.fillText(this.page.locator(SELECTORS.prelimUbi), user.ubiNumber);
  }

  async openPreliminaryRegistration() {
    const registrationLink = this.page.locator(SELECTORS.initialRegistrationLink)
      .or(this.page.locator('//a[@id="m_LoginControl_LinkButton2"]//span[contains(text(),"Click Here")]'))
      .first();

    await registrationLink.click({ noWaitAfter: true, timeout: 30000 });
    await this.page.waitForURL(/UserRegistrationPrelim/i, { timeout: 60000, waitUntil: 'commit' });
    await this.waitForPreliminaryPage();
  }

  async waitForPreliminaryPage() {
    const control = this.page.locator(SELECTORS.businessUnit).first();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await this.form.waitForAspNetIdle();
      await this.dismissInactiveDialog();

      const visible = await control.waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (visible) return control;
      if (attempt === 3) break;

      if (/UserRegistrationPrelim/i.test(this.page.url())) {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
    }

    throw new Error('Conveyance preliminary registration page did not finish loading Business Unit.');
  }

  async selectBusinessUnit(value) {
    const control = await this.waitForPreliminaryPage();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.form.waitForSelectOptions(control);
      await control.selectOption(value);

      for (let waitStep = 1; waitStep <= 20; waitStep += 1) {
        await this.dismissInactiveDialog();

        const selectedValue = await control.inputValue().catch(() => '');
        const hasUserTypeChoices = await this.page.getByRole('radio', { name: 'Conveyance Contractor' }).count().catch(() => 0);
        if (selectedValue === value && hasUserTypeChoices > 0) return true;

        await this.page.waitForTimeout(500);
      }

      if (attempt < 3) {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await this.waitForPreliminaryPage();
      }
    }

    throw new Error(`Business Unit "${value}" did not activate conveyance user types.`);
  }

  async dismissInactiveDialog() {
    const button = this.page.locator(SELECTORS.inactiveDialogButton).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 5000 }).catch(() => {});
      await this.form.waitForReady();
    }
  }

  async selectControl(locator, value, { required = false, label = 'select field' } = {}) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const target = locator.first();
      const visible = await target.waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) {
        if (attempt < 5) continue;
        break;
      }

      const selected = await this.form.selectOption(target, value);
      await this.form.waitForReady();

      if (selected && await this.form.hasSelectedNonPlaceholderOption(target)) {
        return true;
      }
    }

    if (required) {
      throw new Error(`Required ${label} dropdown did not keep a value.`);
    }

    return false;
  }

  async fillText(locator, value) {
    await this.form.fillHard(locator.first(), value);
  }
}
