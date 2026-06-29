import { expect } from '@playwright/test';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { logger } from './logger.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function clearBlockingOverlay(page) {
  const selectors = [
    '#overlay',
    '.blockUI.blockOverlay',
    '.blockOverlay',
    '.loading-overlay',
    '.loader-overlay',
    '.ngx-spinner-overlay',
    '.k-loading-mask',
    '[class*="loading"][class*="overlay"]',
    '[class*="spinner"][class*="overlay"]',
  ];

  for (const selector of selectors) {
    const overlays = page.locator(selector);
    const count = await overlays.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const overlay = overlays.nth(index);
      await overlay.waitFor({ state: 'hidden', timeout: runSettings.overlayTimeout }).catch(() => {});
      if (!(await overlay.isVisible().catch(() => false))) continue;

      logger.warn(`Blocking overlay stayed visible (${selector}); disabling it for this step.`);
      await overlay.evaluate((element) => {
        element.style.pointerEvents = 'none';
        element.style.display = 'none';
        element.style.visibility = 'hidden';
      }).catch(() => {});
    }
  }
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
  await page.evaluate(() => new Promise((resolve) => {
    const manager = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
    if (!manager || !manager.get_isInAsyncPostBack()) {
      resolve();
      return;
    }

    const interval = setInterval(() => {
      if (!manager.get_isInAsyncPostBack()) {
        clearInterval(interval);
        resolve();
      }
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 15000);
  })).catch(() => {});
  await page.waitForTimeout(150).catch(() => {});
}

export async function firstVisible(candidates, { label = 'element', timeout = runSettings.actionTimeout } = {}) {
  const locators = Array.isArray(candidates) ? candidates : [candidates];
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      const count = await locator.count().catch((error) => {
        lastError = error;
        return 0;
      });

      for (let index = 0; index < count; index++) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
    }

    await sleep(250);
  }

  if (lastError) logger.warn(`Last locator error for ${label}: ${lastError.message.split('\n')[0]}`);
  throw new Error(`No visible ${label} found within ${timeout}ms`);
}

export async function click(page, candidates, options = {}) {
  const target = await firstVisible(candidates, options);
  await clearBlockingOverlay(page);
  await target.scrollIntoViewIfNeeded().catch(() => {});

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
  await expect(target).toBeEnabled({ timeout: options.timeout || runSettings.actionTimeout });
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.fill(String(value ?? ''));
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
  await expect(target).toBeEnabled({ timeout: options.timeout || runSettings.actionTimeout });
  await target.selectOption(String(value));
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
  await target.scrollIntoViewIfNeeded().catch(() => {});

  if (await target.isChecked().catch(() => false)) return;

  await target.check({ timeout: options.timeout || runSettings.actionTimeout }).catch(async () => {
    await target.evaluate((element) => {
      const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
      (label || element.closest('label') || element.parentElement || element).click();
    });
  });
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
