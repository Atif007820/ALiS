import { expect } from '@playwright/test';
import { fakerEN_US as faker } from '@faker-js/faker';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { APPLY_CONFIG, LOGIN_URL, TEST_DATA, UPLOAD_FILES_DIR, USER_DATA_PATH } from './config.js';
import {
  COMM_CONVEYANCE_TYPES,
  COUNTERWEIGHT_ROPE_TYPE_CODES,
  FEATURE_CHECKBOXES,
  GOVERNOR_TYPE_CAR_CODES,
  GOVERNOR_TYPE_COUNTERWEIGHT_CODES,
  INTERIOR_TYPE_CODES,
  MACHINE_TYPES,
  RESIDENTIAL_CONVEYANCE_TYPES,
  ROPE_TYPE_CODES,
  US_STATES,
} from './constants.js';
import { logger } from './logger.js';

// =============================================================================
// CORE UTILITIES
// Primitive helpers: randomisation, array utilities, and timing.
// =============================================================================

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
export const randAlpha = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

export const num1to12 = () => String(randInt(1, 12));
export const num1to99 = () => String(randInt(1, 99));
export const num1to99999 = () => String(randInt(1, 99999));
export const xxxx = () => randDigits(4);
export const xxx = () => randDigits(3);

// =============================================================================
// RANDOM DATA GENERATORS
// Generate realistic random values for form fields (phones, IDs, zips, etc.).
// =============================================================================

export const randomPhone10 = () => `${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`;
export const randomUBI = () => `${randDigits(3)}-${randDigits(3)}-${randDigits(3)}`;
export const randomZip = () => `${randDigits(5)}-${randDigits(4)}`;
export const randomZip5_5 = () => `${randDigits(5)}-${randDigits(5)}`;
export const randomECL = () => `ECL${randDigits(3)}`;
export const randomGCL = () => `GCL${randDigits(3)}`;
export const randomEnglishName = () => `${faker.person.firstName()} ${faker.person.lastName()}`;
export const randomBuildingName = () => `${randAlpha(3)} ${pick(TEST_DATA.buildingNameSuffixes)}`;
export const randomUSCity = () => faker.location.city();
export const randomUSState = () => pick(US_STATES);
export const randomAlphaAddress = () => `${randAlpha(3)} ${pick(TEST_DATA.alphaAddressSuffixes)}`;
export const randomTraderManufacturer = () => `${randAlpha(3)} ${pick(TEST_DATA.traderManufacturerSuffixes)}`;
export const randomModelNumXXX = () => `ModelNum${randDigits(3)}`;
export const randomEscModel = () => `EscMod${randDigits(pick(TEST_DATA.escModelDigitLengths))}`;
export const randomDesignation = () => `${pick(TEST_DATA.designationPrefixes)}-${randAlpha(2)}${randDigits(2)}`;

// =============================================================================
// ENTITY & ADDRESS BUILDERS
// Construct structured strings: entity names, addresses, and unit identifiers.
// =============================================================================

export function buildEntityName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  // Format: DD-MM_YYYY  (no brackets)
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}_${now.getFullYear()}`;
  const hours24 = now.getHours();
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const timestamp = `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${meridiem}`;
  // Result example: Test Lab_18-05_2026_12:33 PM
  return `${TEST_DATA.entityNamePrefix}_${date}_${timestamp}`;
}

export function randomAddress(city) {
  const buildingNumber = randDigits(3);
  const buildingType = pick(TEST_DATA.addressBuildingTypes);
  return Math.random() > 0.5
    ? `${buildingNumber} ${buildingType}, ${city} Street`
    : `${buildingNumber} ${buildingType}, ${city}`;
}

export function randomSuiteAptUnit() {
  const prefix = pick(TEST_DATA.unitPrefixes);
  const variant = randInt(0, 2);
  if (variant === 0) return `${prefix} - ${randDigits(1)}`;
  if (variant === 1) return `${prefix} - ${randDigits(1)}/${randAlpha(1)}`;
  return `${prefix} - ${randDigits(2)}/${randAlpha(1)}`;
}

export function randomUnit() {
  const prefix = pick(TEST_DATA.unitPrefixes);
  const variant = randInt(0, 2);
  if (variant === 0) return `${prefix} - ${randDigits(1)}/${randAlpha(1)}`;
  if (variant === 1) return `${prefix} - ${randDigits(2)}/${randAlpha(1)}`;
  return `${prefix} - ${randAlpha(1)}`;
}

export function randomUSLocation() {
  const style = randInt(0, 2);
  if (style === 0) return faker.location.streetAddress();
  if (style === 1) return `${faker.location.street()} Colony`;
  return `${faker.location.street()} ${pick(TEST_DATA.randomLocationSuffixes)}`;
}

// =============================================================================
// USER DATA & AUTH STATE
// Read/write user credentials (userData.json) and Playwright auth storage.
// =============================================================================

export async function loadUserData({ timeoutMs = 30000, pollMs = 250 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(USER_DATA_PATH)) {
      return JSON.parse(readFileSync(USER_DATA_PATH, 'utf-8'));
    }
    await sleep(pollMs);
  }
  throw new Error(`userData.json not found at: ${USER_DATA_PATH}`);
}

export function saveUserData(userData) {
  writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2), 'utf-8');
  logger.success(`Credentials saved to ${USER_DATA_PATH}`);
}

// =============================================================================
// PAGE SETUP UTILITIES
// One-time page configuration applied before test interactions begin.
// =============================================================================

export async function disableAutocomplete(page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('input, textarea')
        .forEach((el) => el.setAttribute('autocomplete', 'off'));
    });
  });
}

export async function clearTextInputs(page) {
  await page
    .locator('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea, select')
    .evaluateAll((elements) => {
      elements.forEach((el) => {
        if (el.readOnly || el.disabled) return;
        if (el.tagName === 'SELECT') {
          el.selectedIndex = -1;
          el.value = '';
        } else {
          el.value = '';
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
}

// =============================================================================
// CORE FIELD FILLERS
// Low-level helpers for typing into inputs, selecting options, and checking
// visibility/enabled state. All higher-level fillers delegate here.
// =============================================================================

export async function fillRawText(locator, value) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await locator.focus();
  await locator.evaluate((el) => {
    if (el.readOnly || el.disabled) return;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await locator.fill('');
  await locator.fill(value);
}

export async function fillField(locator, value, { pressTab = true, timeout = 12000 } = {}) {
  const target = locator.first();
  await target.waitFor({ state: 'visible', timeout });
  await expect(target).toBeEnabled({ timeout: Math.min(timeout, 8000) });
  await target.click();
  await target.fill(String(value));
  if (pressTab) await target.press('Tab');
}

export async function safeSelect(locator, value, { timeout = 12000 } = {}) {
  const target = locator.first();
  await target.waitFor({ state: 'visible', timeout });
  await target.selectOption(value);
  try {
    const pg = target.page();
    if (!pg.isClosed()) await pg.waitForLoadState('domcontentloaded', { timeout: 10000 });
  } catch (err) {
    logger.warn(`Post-select wait skipped: ${err.message.split('\n')[0]}`);
  }
}

export async function isVisible(locator, timeout = 3000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// CONDITIONAL FIELD FILLERS
// Guard-wrapped helpers that skip silently when a field is absent, hidden,
// or disabled — safe to call for optional/conditional form fields.
// =============================================================================

export async function fillIfAvailable(locator, value, {
  label = 'field',
  pressTab = true,
  timeout = 2500,
  waitForVisible = false,
} = {}) {
  const target = locator.first();

  if (!waitForVisible && (await locator.count()) === 0) {
    logger.info(`Skipping ${label}: not present`);
    return false;
  }

  try {
    await target.waitFor({ state: 'visible', timeout });
  } catch {
    logger.info(`Skipping ${label}: not visible`);
    return false;
  }

  try {
    await expect(target).toBeEnabled({ timeout });
  } catch {
    logger.info(`Skipping ${label}: disabled`);
    return false;
  }

  await fillField(target, value, { pressTab, timeout });
  logger.info(`Filled ${label}`);
  return true;
}

export async function fillRiseInInch(page) {
  // Uses riseInInchMin/Max from config (valid range: 1–11).
  const value = String(randInt(TEST_DATA.riseInInchMin, TEST_DATA.riseInInchMax));
  const field = page.locator('#txtRiseInInch:visible').first();

  try {
    await field.waitFor({ state: 'visible', timeout: TEST_DATA.slowFieldTimeoutMs });
  } catch {
    logger.info('Skipping Rise In Inch: not visible');
    return false;
  }

  try {
    await expect(field).toBeEnabled({ timeout: TEST_DATA.slowFieldTimeoutMs });
  } catch {
    logger.info('Skipping Rise In Inch: disabled');
    return false;
  }

  for (let attempt = 1; attempt <= TEST_DATA.slowFieldRetryCount; attempt++) {
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.click({ timeout: 5000 });
    await field.fill('');
    await field.fill(value);
    await field.press('Tab');

    const actualValue = await field.inputValue().catch(() => '');
    if (actualValue === value) {
      logger.info(`Filled Rise In Inch: ${value}`);
      return true;
    }

    logger.warn(`Rise In Inch attempt ${attempt} did not stick. Current value: "${actualValue}"`);
    await field.page().waitForTimeout(TEST_DATA.slowFieldRetryDelayMs);
  }

  // Fallback: set value via native React/Angular input setter to trigger change detection.
  await field.evaluate((element, nextValue) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (valueSetter) valueSetter.call(element, nextValue);
    else element.value = nextValue;

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value);

  await expect(field).toHaveValue(value, { timeout: 5000 });
  logger.info(`Filled Rise In Inch with fallback: ${value}`);
  return true;
}

// =============================================================================
// CONDITIONAL SELECT & CHECKBOX HELPERS
// Guard-wrapped helpers for dropdowns, radios, and checkboxes. Scroll +
// force:true bypasses the sticky <lni-ewn-header> pointer interception.
// =============================================================================

export async function selectIfAvailable(locator, value, { label = 'dropdown', timeout = 2500 } = {}) {
  if ((await locator.count()) === 0) {
    logger.info(`Skipping ${label}: not present`);
    return false;
  }

  const target = locator.first();
  if (!(await isVisible(target, timeout))) {
    logger.info(`Skipping ${label}: not visible`);
    return false;
  }

  if (!(await target.isEnabled().catch(() => false))) {
    logger.info(`Skipping ${label}: disabled`);
    return false;
  }

  await safeSelect(target, value, { timeout });
  logger.info(`Selected ${label}: ${value}`);
  return true;
}


export async function checkIfAvailable(locator, { label = 'option', timeout = 2500 } = {}) {
  if ((await locator.count()) === 0) return false;

  const target = locator.first();
  if (!(await isVisible(target, timeout))) return false;
  if (!(await target.isEnabled().catch(() => false))) return false;

  if ((await target.isChecked().catch(() => false)) === false) {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    try {
      // Angular Material (MDC) hides the native <input> behind a <label> wrapper.
      // check({ force: true }) fires on the invisible input but bypasses Angular's
      // change detection entirely — the state never flips.
      // Clicking the closest <label> (or mat-checkbox) is the only reliable fix.
      await target.evaluate((el) => {
        const clickable =
          (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
          ?? el.closest('label')
          ?? el.closest('mat-checkbox')
          ?? el.parentElement;
        if (clickable) clickable.click();
      });
    } catch {
      return false;
    }
    // Secondary guard: verify state actually flipped.
    if (!(await target.isChecked().catch(() => false))) return false;
  }
  logger.info(`Checked ${label}`);
  return true;
}


export async function checkRandomAvailableRadio(page, labels, { label = 'radio', timeout = 5000 } = {}) {
  // FIX: Pre-flight guard — verify the page actually loaded conveyance radio buttons
  // before entering the shuffle loop. If the app served an error page (e.g. IIS default),
  // no radios will ever appear and the pool-exhaustion error is misleading.
  const anyRadio = page.getByRole('radio').first();
  const pageLoaded = await anyRadio
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!pageLoaded) {
    // Capture the current URL to surface in the error for faster diagnosis.
    const currentUrl = page.url();
    throw new Error(
      `No radio buttons found on page before scanning for "${label}". ` +
      `The application page may not have loaded — current URL: ${currentUrl}. ` +
      `Check that the server is reachable and the navigation step completed successfully.`
    );
  }

  const deadline = Date.now() + timeout;
  const shuffled = shuffle(labels);

  while (Date.now() < deadline) {
    for (const option of shuffled) {
      const radio = page.getByRole('radio', { name: option, exact: true });
      if (await checkIfAvailable(radio, { label: `${label}: ${option}`, timeout: 500 })) {
        return option;
      }
    }
    await sleep(250);
  }

  // FIX: On timeout, log which radios ARE present to help diagnose label mismatches.
  const presentRadios = await page.getByRole('radio').allTextContents().catch(() => []);
  logger.warn(`Radios found on page: ${JSON.stringify(presentRadios)}`);

  throw new Error(
    `No available ${label} found from configured pool after ${timeout}ms. ` +
    `Radios present on page: ${JSON.stringify(presentRadios)}. ` +
    `Verify the labels in constants.js match what the application renders.`
  );
}

export async function checkRandomAvailableCheckboxes(page, labels, { label = 'checkbox', min = 1, max = 3, timeout = 2500 } = {}) {
  const available = [];
  for (const option of shuffle(labels)) {
    const checkbox = page.getByRole('checkbox', { name: option, exact: true });
    if ((await checkbox.count()) === 0) continue;
    if (!(await isVisible(checkbox, timeout))) continue;
    if (!(await checkbox.first().isEnabled().catch(() => false))) continue;
    available.push(option);
  }

  if (available.length === 0) {
    logger.info(`Skipping ${label}: none available`);
    return [];
  }

  const countToSelect = Math.min(randInt(min, max), available.length);
  const selected = [];
  for (const option of available.slice(0, countToSelect)) {
    const checkbox = page.getByRole('checkbox', { name: option, exact: true }).first();
    if (!(await checkbox.isChecked().catch(() => false))) {
      await checkbox.scrollIntoViewIfNeeded().catch(() => {});
      // Same Angular Material fix: click the label wrapper, not the hidden input.
      await checkbox.evaluate((el) => {
        const clickable =
          (el.id ? document.querySelector(`label[for="${el.id}"]`) : null)
          ?? el.closest('label')
          ?? el.closest('mat-checkbox')
          ?? el.parentElement;
        if (clickable) clickable.click();
      });
    }
    selected.push(option);
    logger.info(`Checked ${label}: ${option}`);
  }

  return selected;
}

// =============================================================================
// LOGIN & SESSION MANAGEMENT
// Navigate to the login page, authenticate, and restore existing sessions.
// =============================================================================

export async function login(page, userData, { force = false } = {}) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  const dashboardLink = page.getByText('NPApply for New Permit');
  if (!force && await isVisible(dashboardLink, 15000)) {
    logger.success('Existing logged-in state restored');
    return;
  }

  const loginNameField = page.getByRole('textbox', { name: 'Login Name' });
  if (!(await isVisible(loginNameField, 15000))) {
    if (await isVisible(dashboardLink, 10000)) {
      logger.success('Existing logged-in state restored');
      return;
    }
    throw new Error('Neither the dashboard nor the login form became visible.');
  }

  await fillField(loginNameField, userData.loginName, { pressTab: false });
  await fillField(page.getByRole('textbox', { name: 'Password' }), userData.password, { pressTab: false });
  await page.getByRole('link', { name: 'Login' }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(dashboardLink).toBeVisible({ timeout: 150000 });
  logger.success('Login successful');
}

export async function ensureLoggedIn(page) {
  const userData = await loadUserData();
  await login(page, userData);
  return userData;
}

// =============================================================================
// LICENSE & CONVEYANCE SELECTION
// Select the configured license type (RESIDENTIAL / COMMERCIAL) and pick a
// random valid conveyance endorsement from the corresponding pool.
// =============================================================================

export async function selectConfiguredLicenseAndConveyance(page) {
  const licenseType = String(APPLY_CONFIG.licenseType || '').trim().toUpperCase();
  const licenseRadios = page.getByRole('radio', { name: 'License Type' });

  if (licenseType === 'RESIDENTIAL') {
    const residentialRadio = licenseRadios.first();
    await residentialRadio.waitFor({ state: 'visible', timeout: 150000 });
    await residentialRadio.check();
    logger.info('License Type selected: RESIDENTIAL');

    // FIX: Wait for conveyance radios to appear after license type selection
    // before entering the random-pick loop; avoids false "pool exhausted" errors
    // when the section is still rendering or the page didn't load at all.
    await _waitForConveyanceRadios(page, 'residential conveyance type');

    const conveyanceType = await checkRandomAvailableRadio(page, RESIDENTIAL_CONVEYANCE_TYPES, {
      label: 'residential conveyance type',
      timeout: 10000,
    });
    return { licenseType, conveyanceType };
  }

  if (licenseType === 'COMMERCIAL') {
    const commercialRadio = licenseRadios.nth(1);
    await commercialRadio.waitFor({ state: 'visible', timeout: 150000 });
    await commercialRadio.check();
    logger.info('License Type selected: COMMERCIAL');

    // FIX: Same guard for the commercial branch.
    await _waitForConveyanceRadios(page, 'commercial conveyance type');

    const conveyanceType = await checkRandomAvailableRadio(page, COMM_CONVEYANCE_TYPES, {
      label: 'commercial conveyance type',
      timeout: 10000,
    });
    return { licenseType, conveyanceType };
  }

  throw new Error(`Unsupported APPLY_CONFIG.licenseType "${APPLY_CONFIG.licenseType}". Use RESIDENTIAL or COMMERCIAL.`);
}

/**
 * Internal helper — waits for at least one radio button to appear on the page
 * after a license type is selected. Throws a clear, actionable error if the
 * page never renders the conveyance section (e.g. server error / IIS default page).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label  human-readable label used in the error message
 */
async function _waitForConveyanceRadios(page, label) {
  // FIX: Detect IIS default page or any server error before wasting time in the loop.
  const currentUrl = page.url();
  const iisPage = page.getByRole('link', { name: 'IIS' });
  if (await isVisible(iisPage, 2000)) {
    throw new Error(
      `Server returned an IIS default/error page instead of the application. ` +
      `Cannot select ${label}. Current URL: ${currentUrl}. ` +
      `Verify the server is running and BASE_URL in config.js is correct.`
    );
  }

  // Wait up to 20 s for at least one radio to appear, which confirms the
  // conveyance section rendered after the license type selection.
  const appeared = await page
    .getByRole('radio')
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    throw new Error(
      `Conveyance radio buttons never appeared after selecting ${label}. ` +
      `Current URL: ${currentUrl}. ` +
      `Check that the application rendered the conveyance section and the server is reachable.`
    );
  }
}

// =============================================================================
// MACHINE INFORMATION — FIELD-LEVEL HELPERS
// Individual helpers for specific machine-information sub-sections, each
// encapsulating its own availability check and field interactions.
// =============================================================================

export async function selectRandomMachineTypeCheckboxes(page) {
  await checkRandomAvailableCheckboxes(page, MACHINE_TYPES, {
    label: 'machine type',
    min: 1,
    max: 3,
    timeout: 3000,
  });
}

export async function selectRandomYesNo(page) {
  const chosen = pick(TEST_DATA.yesNoOptions);
  const primary = page.locator('cc-machine-information mat-radio-group').last();
  const fallbackXPath =
    '/html/body/app-root/basepage/main/div/div[3]/div[2]/div/' +
    'app-routes-licensing-external-application/app-additional-information/form/' +
    'cc-machine-information/section/div[2]/div[9]/div[9]/div[2]/mat-radio-group';

  let group = primary;
  if (!(await isVisible(group, 3000))) {
    group = page.locator(`xpath=${fallbackXPath}`);
  }

  if (!(await isVisible(group, 3000))) {
    logger.info('Skipping Yes/No radio group: not available');
    return false;
  }

  await group.locator('mat-radio-button', { hasText: chosen }).click();
  logger.info(`Selected Yes/No option: ${chosen}`);
  return true;
}

export async function selectRandomInteriorType(page) {
  const chosen = pick(INTERIOR_TYPE_CODES);
  const selected = await selectIfAvailable(page.getByLabel('Interior Type'), chosen, {
    label: 'Interior Type',
  });

  if (selected && chosen === 'OTHR') {
    await fillIfAvailable(
      page.getByRole('textbox', { name: 'Interior Type Other Description' }),
      TEST_DATA.interiorTypeOtherDescription,
      { label: 'Interior Type Other Description' }
    );
  }
}

export async function selectRandomGovernorTypeCar(page) {
  const chosen = pick(GOVERNOR_TYPE_CAR_CODES);
  const selected = await selectIfAvailable(page.locator('#ddlGovernorTypeCode'), chosen, {
    label: 'Governor Type - Car',
  });

  if (selected && chosen === 'OTHR') {
    await fillIfAvailable(
      page.getByRole('textbox', { name: 'Governor type Other Description' }),
      TEST_DATA.governorTypeOtherDescription,
      { label: 'Governor Type Other Description' }
    );
  }
}

export async function selectRandomGovernorTypeCW(page) {
  const chosen = pick(GOVERNOR_TYPE_COUNTERWEIGHT_CODES);
  const selected = await selectIfAvailable(page.locator('#ddlGovernorTypeCodeCW'), chosen, {
    label: 'Governor Type - Counterweight',
  });

  if (selected && chosen === 'OTHR') {
    await fillIfAvailable(
      page.locator("//input[@id='txtGovernorTypeOtherDescriptionCW']"),
      TEST_DATA.governorTypeOtherDescriptionCW,
      { label: 'Governor Type Other Description - Counterweight' }
    );
  }
}

export async function selectRandomFeatureCheckboxes(page) {
  await checkRandomAvailableCheckboxes(page, FEATURE_CHECKBOXES, {
    label: 'feature',
    min: 1,
    max: FEATURE_CHECKBOXES.length,
    timeout: 3000,
  });
}

// =============================================================================
// DOCUMENT UPLOAD
// Upload mandatory permit documents via the file-upload dialog.
// =============================================================================

export async function uploadExistingFile(page, { trigger, filePath, comments }) {
  await trigger.waitFor({ state: 'visible', timeout: 150000 });
  await trigger.click();

  const dialog = page.locator('mat-dialog-container');
  await page.locator('#custom-add1').first().click();
  await dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByRole('textbox', { name: 'comments' }).fill(comments);
  await page.getByRole('button', { name: 'Upload' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 150000 });
}

export async function uploadVisibleMandatoryDocuments(page) {
  const mandatoryDocs = page.locator('[id^="mandatoryDoc"][id$="-0"]');
  await mandatoryDocs.first().waitFor({ state: 'visible', timeout: 150000 });

  const totalDocs = await mandatoryDocs.count();
  let uploaded = 0;

  for (let index = 0; index < totalDocs; index++) {
    const trigger = mandatoryDocs.nth(index);
    if (!(await isVisible(trigger, 2000))) {
      continue;
    }

    const uploadFile = TEST_DATA.uploadDocuments[uploaded];
    if (!uploadFile) {
      throw new Error(`Found more mandatory documents than configured upload files. Add another file in TEST_DATA.`);
    }

    await uploadExistingFile(page, {
      trigger,
      filePath: join(UPLOAD_FILES_DIR, uploadFile.fileName),
      comments: uploadFile.comments,
    });
    uploaded++;
  }

  if (uploaded === 0) {
    throw new Error('No mandatory document upload controls were visible.');
  }

  logger.success(`Uploaded ${uploaded} mandatory document(s).`);
  return uploaded;
}

// =============================================================================
// MACHINE INFORMATION — ORCHESTRATOR
// Fills the entire Machine Information step in sequence: dimensions, machine
// type, governor data, rope details, interior type, and feature checkboxes.
// =============================================================================

export async function fillMachineInformation(page) {
  await fillIfAvailable(page.getByRole('textbox', { name: 'Conveyance Contract Value' }), xxxx(), {
    label: 'Conveyance Contract Value',
  });
  await fillIfAvailable(page.getByRole('textbox', { name: 'Conveyance/Escalator Manufacturer' }), randomTraderManufacturer(), {
    label: 'Conveyance/Escalator Manufacturer',
  });
  await fillIfAvailable(page.getByRole('textbox', { name: 'Conveyance/Escalator Model' }), randomEscModel(), {
    label: 'Conveyance/Escalator Model',
  });

  await selectRandomMachineTypeCheckboxes(page);

  const textFields = [
    [page.getByRole('textbox', { name: 'Conveyance Designation' }), randomDesignation(), 'Conveyance Designation'],
    [page.getByRole('textbox', { name: 'Capacity (lbs)' }), num1to99999(), 'Capacity (lbs)'],
    [page.getByRole('textbox', { name: 'Rated Speed (feet per minute)' }), num1to12(), 'Rated Speed'],
    [page.getByRole('textbox', { name: 'Up Speed (feet per minute)' }), num1to12(), 'Up Speed'],
    [page.getByRole('textbox', { name: 'Down Speed (feet per minute)' }), num1to12(), 'Down Speed'],
    [page.getByRole('textbox', { name: '# of Landings' }), num1to12(), '# of Landings'],
    [page.locator('#txtRiseInFeet'), num1to12(), 'Rise In Feet'],
  ];

  for (const [locator, value, label] of textFields) {
    await fillIfAvailable(locator, value, { label });
  }

  await fillRiseInInch(page);

  const remainingTextFields = [
    [page.getByRole('textbox', { name: 'Net Travel (inches)' }), num1to12(), 'Net Travel'],
    [page.getByRole('textbox', { name: 'Car Inside Net Width (inches)' }), num1to12(), 'Car Inside Net Width'],
    [page.getByRole('textbox', { name: 'Car Inside Net Length (inches)' }), num1to12(), 'Car Inside Net Length'],
    [page.getByRole('textbox', { name: 'Car Height' }), num1to12(), 'Car Height'],
    [page.getByRole('textbox', { name: '# of Front Openings' }), num1to12(), '# of Front Openings'],
    [page.getByRole('textbox', { name: '# of Rear Openings' }), num1to12(), '# of Rear Openings'],
    [page.getByRole('textbox', { name: 'Blind Hoistway (feet)' }), num1to12(), 'Blind Hoistway'],
  ];

  for (const [locator, value, label] of remainingTextFields) {
    await fillIfAvailable(locator, value, { label });
  }

  await selectRandomYesNo(page);

  await fillIfAvailable(page.getByRole('textbox', { name: 'Location of the Controller' }), randomUSLocation(), {
    label: 'Location of the Controller',
  });
  await fillIfAvailable(page.getByRole('textbox', { name: 'Controller Manufacturer' }), randomTraderManufacturer(), {
    label: 'Controller Manufacturer',
  });
  await fillIfAvailable(page.getByRole('textbox', { name: 'Controller Model Number' }), randomModelNumXXX(), {
    label: 'Controller Model Number',
  });

  await selectRandomInteriorType(page);
  await fillIfAvailable(page.getByRole('textbox', { name: 'Interior Material Weight (lbs)' }), xxxx(), {
    label: 'Interior Material Weight',
  });

  await fillIfAvailable(page.getByRole('textbox', { name: 'Motor Horsepower' }), xxx(), {
    label: 'Motor Horsepower',
  });
  await fillIfAvailable(page.getByRole('textbox', { name: 'Gripper Brake Location' }), randomUSLocation(), {
    label: 'Gripper Brake Location',
  });

  await selectRandomGovernorTypeCar(page);
  await fillIfAvailable(page.locator('#txtGovernorTripSpeed'), xxxx(), { label: 'Governor Trip Speed' });
  await fillIfAvailable(page.locator('#txtOverspeedTripSpeed'), num1to99(), { label: 'Overspeed Trip Speed' });
  await fillIfAvailable(page.locator('#txtPullThrough'), xxxx(), { label: 'Pull Through' });
  await fillIfAvailable(page.locator('#txtPullOut'), xxxx(), { label: 'Pull Out' });
  await selectIfAvailable(page.locator('#ddlGovernorRopeType'), pick(ROPE_TYPE_CODES), { label: 'Governor Rope Type' });
  await fillIfAvailable(page.locator('#txtRopeSize'), num1to99(), { label: 'Rope Size' });

  await selectRandomGovernorTypeCW(page);
  await fillIfAvailable(page.locator('#txtGovernorTripSpeedCW'), xxxx(), { label: 'Governor Trip Speed CW' });
  await fillIfAvailable(page.locator('#txtOverspeedTripSpeedCW'), xxxx(), { label: 'Overspeed Trip Speed CW' });
  await fillIfAvailable(page.locator('#txtPullThroughCW'), num1to99(), { label: 'Pull Through CW' });
  await fillIfAvailable(page.locator('input[name="txtPullOutCW"]'), num1to99(), { label: 'Pull Out CW' });
  await selectIfAvailable(page.locator('#ddlRopeTypeCW'), pick(COUNTERWEIGHT_ROPE_TYPE_CODES), {
    label: 'Counterweight Rope Type',
  });
  await fillIfAvailable(page.locator('#txtRopeSizeCW'), num1to99(), { label: 'Rope Size CW' });

  await selectRandomFeatureCheckboxes(page);
}
