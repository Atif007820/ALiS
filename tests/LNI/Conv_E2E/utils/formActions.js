/**
 * formActions.js
 *
 * Low-level browser interaction helpers used by Page Object classes.
 * All functions are stateless and accept Playwright locators / pages directly.
 */

import { expect } from '@playwright/test';
import { logger } from './logger.js';
import { pick, randInt, shuffle, sleep } from './randomData.js';

// ─── Page-level Helpers ───────────────────────────────────────────────────────

/**
 * Inject an init-script that disables autocomplete on all inputs/textareas.
 * Call once per page before filling any forms.
 * @param {import('@playwright/test').Page} page
 */
export async function disableAutocomplete(page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('input, textarea')
        .forEach((el) => el.setAttribute('autocomplete', 'off'));
    });
  });
}

/**
 * Clear every visible text/email/tel/password/textarea/select on the page
 * by directly resetting their DOM value and dispatching change events.
 * @param {import('@playwright/test').Page} page
 */
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
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
}

// ─── Locator-level Fill Helpers ───────────────────────────────────────────────

/**
 * Fill a field using direct DOM value manipulation + input/change events.
 * Use for Angular/React controlled inputs that ignore `.fill()` alone.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string|number} value
 */
export async function fillRawText(locator, value, { timeout = 15000 } = {}) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await expect(locator).toBeEnabled({ timeout });
    await locator.focus();
    await locator.evaluate((el) => {
      if (el.readOnly || el.disabled) return;
      el.value = '';
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await locator.fill('', { timeout });
    await locator.fill(String(value), { timeout });
  } catch (error) {
    logger.warn(`fillRawText error: ${error.message.split('\n')[0]}`);
    throw error;
  }
}

/**
 * Standard field fill: wait → click → fill → optionally press Tab.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string|number} value
 * @param {{ pressTab?: boolean, timeout?: number }} [options]
 */
export async function fillField(locator, value, { pressTab = true, timeout = 12000 } = {}) {
  const target = locator.first();
  try {
    await target.waitFor({ state: 'visible', timeout });
    await expect(target).toBeEnabled({ timeout: Math.min(timeout, 8000) });

    try {
      await target.click({ timeout });
      await target.fill(String(value));
    } catch (error) {
      logger.warn(`Click blocked or timed out; falling back to raw fill. ${error.message.split('\n')[0]}`);
      await fillRawText(target, value, { timeout });
    }

    if (pressTab) await target.press('Tab').catch(() => {});
  } catch (error) {
    logger.error(`fillField failed for value ${value}: ${error.message.split('\n')[0]}`);
    throw error;
  }
}

/**
 * Select an option from a `<select>` element and wait for the page to settle.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} value  The option value to select.
 * @param {{ timeout?: number }} [options]
 */
export async function safeSelect(locator, value, { timeout = 12000 } = {}) {
  const target = locator.first();
  await target.waitFor({ state: 'visible', timeout });
  await target.selectOption(value);
  try {
    const page = target.page();
    if (!page.isClosed()) await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  } catch (err) {
    logger.warn(`Post-select wait skipped: ${err.message.split('\n')[0]}`);
  }
}

// ─── Conditional / "If Available" Helpers ────────────────────────────────────

/**
 * Return `true` if the locator becomes visible within `timeout` ms.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {number} [timeout=3000]
 * @returns {Promise<boolean>}
 */
export async function isVisible(locator, timeout = 3000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fill a field only if it is present, visible, and enabled.
 * Silently skips with an info log if any condition is not met.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string|number} value
 * @param {{ label?: string, pressTab?: boolean, timeout?: number, waitForVisible?: boolean }} [options]
 * @returns {Promise<boolean>} `true` if the field was filled.
 */
export async function fillIfAvailable(locator, value, {
  label          = 'field',
  pressTab       = true,
  timeout        = 2500,
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

/**
 * Select an option only if the dropdown is present, visible, and enabled.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} value
 * @param {{ label?: string, timeout?: number }} [options]
 * @returns {Promise<boolean>} `true` if the option was selected.
 */
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

/**
 * Check a checkbox only if it is present, visible, enabled, and not already checked.
 * Handles Angular Material `<mat-checkbox>` wrappers automatically.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {{ label?: string, timeout?: number }} [options]
 * @returns {Promise<boolean>} `true` if the checkbox was checked.
 */
export async function checkIfAvailable(locator, { label = 'option', timeout = 2500 } = {}) {
  if ((await locator.count()) === 0) return false;

  const target = locator.first();
  if (!(await isVisible(target, timeout))) return false;
  if (!(await target.isEnabled().catch(() => false))) return false;

  if ((await target.isChecked().catch(() => false)) === false) {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    try {
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
    if (!(await target.isChecked().catch(() => false))) return false;
  }

  logger.info(`Checked ${label}`);
  return true;
}

// ─── Random-selection Helpers ─────────────────────────────────────────────────

/**
 * Try radio buttons from a shuffled list until one can be checked.
 * Waits up to `timeout` ms polling every 250 ms.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} labels       List of radio button names to try.
 * @param {{ label?: string, timeout?: number }} [options]
 * @returns {Promise<string>} The name of the radio that was selected.
 */
export async function checkRandomAvailableRadio(page, labels, { label = 'radio', timeout = 5000 } = {}) {
  const anyRadio = page.getByRole('radio').first();
  const pageLoaded = await anyRadio
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!pageLoaded) {
    throw new Error(
      `No radio buttons found before scanning for "${label}". ` +
      `Current URL: ${page.url()}. Verify the page loaded correctly.`
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

  const present = await page.getByRole('radio').allTextContents().catch(() => []);
  logger.warn(`Radios found on page: ${JSON.stringify(present)}`);
  throw new Error(
    `No available ${label} found from configured pool after ${timeout}ms. ` +
    `Radios present: ${JSON.stringify(present)}.`
  );
}

/**
 * Check a random subset of checkboxes from a shuffled list.
 * Skips any that are missing, invisible, or disabled.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} labels
 * @param {{ label?: string, min?: number, max?: number, timeout?: number }} [options]
 * @returns {Promise<string[]>} Names of the checkboxes that were checked.
 */
export async function checkRandomAvailableCheckboxes(page, labels, {
  label   = 'checkbox',
  min     = 1,
  max     = 3,
  timeout = 2500,
} = {}) {
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

/**
 * Pick a random option and select it using a locator factory function.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} options
 * @param {(page: import('@playwright/test').Page) => import('@playwright/test').Locator} locatorFactory
 * @param {string} label
 * @returns {Promise<string|null>} The selected option, or `null` if unavailable.
 */
export async function selectRandomOption(page, options, locatorFactory, label) {
  const option   = pick(options);
  const selected = await selectIfAvailable(locatorFactory(page), option, { label });
  return selected ? option : null;
}
