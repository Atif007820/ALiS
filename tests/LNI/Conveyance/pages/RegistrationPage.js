import { BasePage } from './BasePage.js';
import { BASE_URL, ENVIRONMENT_LABEL, LOGIN_URL } from '../config/URL.js';
import { appConfig } from '../config/runConfig.js';
import { TEST_DATA } from '../config/editableData.js';
import {
  COUNTRIES,
  ENTITY_ROLES,
  ROLE_OPTIONS,
  US_CITIES,
  US_STATES,
} from '../config/constants.js';
import {
  clearTextInputs,
  disableAutocomplete,
  fillRawText,
  safeSelect,
} from '../utils/formActions.js';
import {
  buildRegistrationUser,
  pick,
  randomAddress,
  randomECL,
  randomGCL,
  randomLoginNameForAttempt,
  randomPhone10,
  randomUnit,
  randomZip,
} from '../utils/randomData.js';
import { saveUserData } from '../utils/userStore.js';
import { logger } from '../utils/logger.js';

export class RegistrationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
  }

  /**
   * Build a fresh random user object for registration.
   * @returns {object} userData
   */
  buildUserData() {
    return buildRegistrationUser();
  }

  /**
   * Full registration flow: opens the form, fills all sections, and submits.
   * Saves credentials to disk and returns the saved user object.
   *
   * @param {object} [userData] - Pre-built user data (generated if omitted).
   * @returns {Promise<object>} savedUser
   */
  async registerNewContractorUser(userData = this.buildUserData()) {
    logger.section('01 Register values');
    logger.info(`Person:     ${userData.firstName} ${userData.lastName}`);
    logger.info(`Login Name: ${userData.loginName}`);
    logger.info(`Entity:     ${userData.entityName}`);
    logger.info(`UBI:        ${userData.ubi}`);
    logger.info(`Environment: ${ENVIRONMENT_LABEL}`);
    logger.info(`Env URL:     ${BASE_URL}`);

    await disableAutocomplete(this.page);
    await this.openRegistrationForm();
    await this.fillRoleDetails();
    await this.fillEntityInformation(userData);
    await this.fillAccountInformation(userData);

    const savedUser = await this.submitWithUniqueLogin(userData);
    saveUserData(savedUser);
    logger.success('Registration successful');
    return savedUser;
  }

  // ─── Private Step Methods ─────────────────────────────────────────────────

  async openRegistrationForm() {
    await super.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await Promise.all([
      this.page.waitForURL(/UserRegistrationPrelim/i, { timeout: appConfig.timeouts.navigation }),
      this.page.locator('#m_LoginControl_LinkButton2').click(),
    ]);
    await this.waitForLoad('domcontentloaded');
    await this.waitForVisible(this.page.getByLabel('Business Unit'), appConfig.timeouts.navigation);
  }

  async fillRoleDetails() {
    await safeSelect(this.page.getByLabel('Business Unit'), TEST_DATA.businessUnit, { timeout: appConfig.timeouts.navigation });
    await this.page.getByRole('radio', { name: TEST_DATA.contractorRoleName }).check();
    await safeSelect(this.page.getByLabel('Please select your role'), pick(ROLE_OPTIONS));
    await fillRawText(this.page.getByRole('textbox', { name: 'Elevator Contractor License#' }), randomECL());
    await fillRawText(this.page.getByRole('textbox', { name: 'General Contractor License#' }), randomGCL());

    await Promise.all([
      this.page.getByRole('textbox', { name: 'Entity Name' }).waitFor({ state: 'visible' }),
      this.page.getByRole('button', { name: 'Next' }).click(),
    ]);
  }

  async fillEntityInformation(userData) {
    const city = pick(US_CITIES);

    await clearTextInputs(this.page);
    await fillRawText(this.page.getByRole('textbox', { name: 'Entity Name' }),            userData.entityName);
    await fillRawText(this.page.getByRole('textbox', { name: 'UBI #' }),                  userData.ubi);
    await fillRawText(this.page.locator('#txtFirstNameBE'),                                TEST_DATA.businessContactFirstName);
    await fillRawText(this.page.locator('#txtLastNameBE'),                                 TEST_DATA.businessContactLastName);
    await safeSelect (this.page.getByLabel('Role'),                                        pick(ENTITY_ROLES));
    await fillRawText(this.page.locator('#Email'),                                         TEST_DATA.businessEmail);
    await fillRawText(this.page.locator('#txtPhone'),                                      randomPhone10());
    await safeSelect (this.page.getByLabel('Country'),                                     pick(COUNTRIES));
    await fillRawText(this.page.getByRole('textbox', { name: 'Address' }),                 randomAddress(city));
    await fillRawText(this.page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }),     randomUnit());
    await fillRawText(this.page.getByRole('textbox', { name: 'City' }),                   city);
    await safeSelect (this.page.getByLabel('State/Province'),                              pick(US_STATES));
    await fillRawText(this.page.getByRole('textbox', { name: 'Zip' }),                    randomZip());
    await fillRawText(this.page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), randomPhone10());
    await fillRawText(this.page.getByRole('textbox', { name: 'Primary E-mail' }),          TEST_DATA.businessEmail);
    await fillRawText(this.page.getByRole('textbox', { name: 'Alternate E-mail' }),        TEST_DATA.alternateEmail);
  }

  async fillAccountInformation(userData) {
    await fillRawText(this.page.locator('#txtLastName'),                                      userData.lastName);
    await fillRawText(this.page.locator('#txtFirstName'),                                     userData.firstName);
    await fillRawText(this.page.getByPlaceholder('E-mail'),                                   TEST_DATA.businessEmail);
    await fillRawText(this.page.locator('#txtUserPhone'),                                      randomPhone10());
    await this.page.getByRole('checkbox', { name: 'I have read and agree to the' }).click();
    await fillRawText(this.page.getByRole('textbox', { name: 'Name*', exact: true }),         `${userData.firstName} ${userData.lastName}`);
    await fillRawText(this.page.getByRole('textbox', { name: 'Login Name*' }),                userData.loginName);
    await fillRawText(this.page.getByRole('textbox', { name: 'Password*' }),                  userData.password);
    await fillRawText(this.page.getByRole('textbox', { name: 'Re-type Password *' }),         userData.password);
  }

  /**
   * Click Register, retrying with a longer numeric login suffix if the login is taken.
   * Attempt 1 starts with 2 digits, then 3, 4, 5, and so on.
   * @param {object} userData
   * @returns {Promise<object>} The saved user with the final unique loginName.
   */
  async submitWithUniqueLogin(userData) {
    let loginName = userData.loginName;
    const maxAttempts = Math.max(1, appConfig.registrationLoginRetryLimit);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.page.getByRole('button', { name: 'Register' }).click();
      await this.page.waitForTimeout(1000);

      const successMsg     = this.page.getByText('There may be processing time while your company ad');
      const duplicateError = this.page.locator("//li[contains(text(),'Login Name must be unique; the login name has alre')]");

      const result = await Promise.any([
        successMsg.waitFor    ({ state: 'visible', timeout: 30000 }).then(() => 'success'),
        duplicateError.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'duplicate'),
      ]).catch(() => 'timeout');

      if (result === 'success') {
        return { ...userData, loginName };
      }

      if (result === 'duplicate') {
        if (attempt === maxAttempts) {
          throw new Error(`Registration failed: login name was still taken after ${maxAttempts} attempt(s). Increase registrationLoginRetryLimit in config/runSettings.json.`);
        }

        loginName = randomLoginNameForAttempt(attempt);
        const digitLength = (TEST_DATA.loginNameStartDigits ?? 2) + attempt;
        logger.warn(`Login name taken - retrying with ${digitLength} digits: "${loginName}" (${attempt + 1}/${maxAttempts})`);
        await fillRawText(this.page.getByRole('textbox', { name: 'Login Name*' }), loginName);
        continue;
      }

      throw new Error('Registration failed: timed out waiting for success or duplicate-login error.');
    }

    throw new Error(`Registration failed: exhausted ${maxAttempts} login-name attempt(s).`);
  }
}
