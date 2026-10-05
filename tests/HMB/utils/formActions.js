import { expect } from '@playwright/test';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { logger } from './logger.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OVERLAY_SELECTOR = [
  '#overlay',
  '.blockUI.blockOverlay',
  '.blockOverlay',
  '.loading-overlay',
  '.loader-overlay',
  '.ngx-spinner-overlay',
  '.k-loading-mask',
  '[class*="loading"][class*="overlay"]',
  '[class*="spinner"][class*="overlay"]',
].join(', ');

export async function clearBlockingOverlay(page) {
  const overlays = page.locator(OVERLAY_SELECTOR).filter({ visible: true });
  if (await overlays.count() === 0) return;

  // A combined locator deduplicates overlays matching several selectors.
  const cleared = await expect(overlays).toHaveCount(0, { timeout: runSettings.overlayTimeout })
    .then(() => true).catch(() => false);
  if (cleared) return;

  logger.warn('Blocking overlay stayed visible; disabling it for this step.');
  await overlays.evaluateAll((elements) => {
    for (const element of elements) {
      element.style.pointerEvents = 'none';
      element.style.display = 'none';
      element.style.visibility = 'hidden';
    }
  });
}

export async function waitForPageReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: runSettings.navigationTimeout }).catch(() => {});
  await waitForAsyncPostback(page);
  await clearBlockingOverlay(page);
}

export async function waitAfterAction(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await waitForAsyncPostback(page);
  await clearBlockingOverlay(page);
}

export async function waitForAsyncPostback(page) {
  await page.waitForFunction(() => {
    const manager = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
    return !manager?.get_isInAsyncPostBack();
  }, undefined, { polling: 50, timeout: runSettings.navigationTimeout });
}

export async function firstVisible(candidates, { label = 'element', timeout = runSettings.actionTimeout } = {}) {
  const locators = Array.isArray(candidates) ? candidates : [candidates];
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      const candidate = locator.filter({ visible: true }).first();
      const visible = await candidate.isVisible().catch((error) => {
        lastError = error;
        return false;
      });
      if (visible) return candidate;
    }

    await sleep(250);
  }

  if (lastError) logger.warn(`Last locator error for ${label}: ${lastError.message.split('\n')[0]}`);
  throw new Error(`No visible ${label} found within ${timeout}ms`);
}

export async function click(page, candidates, options = {}) {
  const target = await firstVisible(candidates, options);
  await clearBlockingOverlay(page);

  try {
    await target.click({ timeout: options.timeout || runSettings.actionTimeout, force: options.force || false });
  } catch (error) {
    logger.warn(`Click retry for ${options.label || 'element'}: ${error.message.split('\n')[0]}`);
    await target.evaluate((element) => element.click()).catch(async () => {
      await target.click({ timeout: options.timeout || runSettings.actionTimeout, force: true });
    });
  }
}

export async function clickAndWait(page, candidates, options = {}) {
  await click(page, candidates, options);
  await waitAfterAction(page);
}

export async function fill(page, candidates, value, options = {}) {
  const target = await firstVisible(candidates, options);
  await clearBlockingOverlay(page);
  await target.fill(String(value ?? ''), { timeout: options.timeout || runSettings.actionTimeout });
}

export async function fillIfVisible(page, candidates, value, options = {}) {
  const target = await firstVisible(candidates, { ...options, timeout: options.timeout || 3000 }).catch(() => null);
  if (!target) return false;
  await fill(page, target, value, options);
  return true;
}

export async function select(page, candidates, value, options = {}) {
  const target = await firstVisible(candidates, options);
  await clearBlockingOverlay(page);
  await target.selectOption(String(value), { timeout: options.timeout || runSettings.actionTimeout });
}

export async function selectIfVisible(page, candidates, value, options = {}) {
  const target = await firstVisible(candidates, { ...options, timeout: options.timeout || 3000 }).catch(() => null);
  if (!target) return false;
  await select(page, target, value, options);
  return true;
}

export async function check(page, candidates, options = {}) {
  const target = await firstVisible(candidates, options);
  await clearBlockingOverlay(page);

  if (await target.isChecked().catch(() => false)) return;

  const timeout = options.timeout || runSettings.actionTimeout;
  const materialRadio = await target.locator('xpath=ancestor::mat-radio-button[1]').count() > 0;
  // Material decorations can cover the native input. Use the existing label
  // fallback promptly, while retaining the full timeout to verify selection.
  await target.check({ timeout: materialRadio ? Math.min(timeout, 3000) : timeout }).catch(async () => {
    await target.evaluate((element) => {
      const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
      (label || element.closest('label') || element.parentElement || element).click();
    });
  });
  await expect(target).toBeChecked({ timeout });
}

export async function checkIfVisible(page, candidates, options = {}) {
  const target = await firstVisible(candidates, { ...options, timeout: options.timeout || 3000 }).catch(() => null);
  if (!target) return false;
  await check(page, target, options);
  return true;
}

export async function visibleDialog(page, textPattern, label = 'dialog') {
  return firstVisible([
    page.locator('[role="dialog"], mat-dialog-container, .modal-content').filter({ hasText: textPattern }),
    page.locator('body').filter({ hasText: textPattern }),
  ], { label, timeout: 30000 });
}
