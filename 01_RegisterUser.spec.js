import { test, expect } from '@playwright/test';
import { fakerEN_US as faker } from '@faker-js/faker';
import { LOGIN_URL, TEST_DATA } from './config.js';
import { COUNTRIES, ENTITY_ROLES, ROLE_OPTIONS, US_CITIES, US_STATES } from './constants.js';
import { addUserAnnotations } from './annotations.js';
import { logger } from './logger.js';
import {
  buildEntityName,
  clearTextInputs,
  disableAutocomplete,
  fillRawText,
  pick,
  randomAddress,
  randomECL,
  randomGCL,
  randomPhone10,
  randomUBI,
  randomUnit,
  randomZip,
  saveUserData,
} from './functions.js';

test('01 - Register New User', async ({ page }, testInfo) => {
  test.setTimeout(10 * 60 * 1000);

  const selectedRole = pick(ROLE_OPTIONS);
  const ubiNumber = randomUBI();
  const entityRole = pick(ENTITY_ROLES);
  const bizPhone = randomPhone10();
  const country = pick(COUNTRIES);
  const state = pick(US_STATES);
  const city = pick(US_CITIES);
  const zip = randomZip();
  const primaryPhone = randomPhone10();
  const userPhone = randomPhone10();
  const eclNumber = randomECL();
  const gclNumber = randomGCL();
  const entityName = buildEntityName();
  const address = randomAddress(city);
  const subUnit = randomUnit();

  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const loginName = `${lastName}_${firstName.charAt(0)}`;
  const password = TEST_DATA.defaultPassword;
  const userData = { loginName, password, firstName, lastName, entityName };

  addUserAnnotations(testInfo, userData);

  logger.section('01 Register values');
  logger.info(`Person: ${firstName} ${lastName}`);
  logger.info(`Login Name: ${loginName}`);
  logger.info(`Entity: ${entityName}`);

  await disableAutocomplete(page);

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await page.locator('#m_LoginControl_LinkButton2').click();

  await page.getByLabel('Business Unit').selectOption(TEST_DATA.businessUnit);
  await page.getByRole('radio', { name: TEST_DATA.contractorRoleName }).check();
  await page.getByLabel('Please select your role').selectOption(selectedRole);
  await fillRawText(page.getByRole('textbox', { name: 'Elevator Contractor License#' }), eclNumber);
  await fillRawText(page.getByRole('textbox', { name: 'General Contractor License#' }), gclNumber);

  await Promise.all([
    page.getByRole('textbox', { name: 'Entity Name' }).waitFor({ state: 'visible' }),
    page.getByRole('button', { name: 'Next' }).click(),
  ]);

  await clearTextInputs(page);

  await fillRawText(page.getByRole('textbox', { name: 'Entity Name' }), entityName);
  await fillRawText(page.getByRole('textbox', { name: 'UBI #' }), ubiNumber);
  await fillRawText(page.locator('#txtFirstNameBE'), TEST_DATA.businessContactFirstName);
  await fillRawText(page.locator('#txtLastNameBE'), TEST_DATA.businessContactLastName);
  await page.getByLabel('Role').selectOption(entityRole);
  await fillRawText(page.locator('#Email'), TEST_DATA.businessEmail);
  await fillRawText(page.locator('#txtPhone'), bizPhone);
  await page.getByLabel('Country').selectOption(country);
  await fillRawText(page.getByRole('textbox', { name: 'Address' }), address);
  await fillRawText(page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }), subUnit);
  await fillRawText(page.getByRole('textbox', { name: 'City' }), city);
  await page.getByLabel('State/Province').selectOption(state);
  await fillRawText(page.getByRole('textbox', { name: 'Zip' }), zip);
  await fillRawText(page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), primaryPhone);
  await fillRawText(page.getByRole('textbox', { name: 'Primary E-mail' }), TEST_DATA.businessEmail);
  await fillRawText(page.getByRole('textbox', { name: 'Alternate E-mail' }), TEST_DATA.alternateEmail);

  await fillRawText(page.locator('#txtLastName'), lastName);
  await fillRawText(page.locator('#txtFirstName'), firstName);
  await fillRawText(page.getByPlaceholder('E-mail'), TEST_DATA.businessEmail);
  await fillRawText(page.locator('#txtUserPhone'), userPhone);
  await page.getByRole('checkbox', { name: 'I have read and agree to the' }).click();
  await fillRawText(page.getByRole('textbox', { name: 'Name*', exact: true }), `${firstName} ${lastName}`);
  let currentLoginName = loginName;
  let suffixNum = 0;

  await fillRawText(page.getByRole('textbox', { name: 'Login Name*' }), currentLoginName);
  await fillRawText(page.getByRole('textbox', { name: 'Password*' }), password);
  await fillRawText(page.getByRole('textbox', { name: 'Re-type Password *' }), password);

  while (true) {
    await page.getByRole('button', { name: 'Register' }).click();

    const successMsg = page.getByText('There may be processing time while your company ad');
    const duplicateError = page.locator("//li[contains(text(),'Login Name must be unique; the login name has alre')]");

    const result = await Promise.any([
      successMsg.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'success'),
      duplicateError.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'duplicate'),
    ]).catch(() => 'timeout');

    if (result === 'success') {
      logger.success('Registration successful');
      saveUserData({ ...userData, loginName: currentLoginName });
      break;
    }

    if (result === 'duplicate') {
      suffixNum++;
      currentLoginName = `${loginName}${suffixNum}`;
      logger.warn(`Login name already taken. Retrying with "${currentLoginName}"`);
      await fillRawText(page.getByRole('textbox', { name: 'Login Name*' }), currentLoginName);
      continue;
    }

    logger.error('Registration failed');
    throw new Error('Registration failed — timed out waiting for success or duplicate error message.');
  }
});
