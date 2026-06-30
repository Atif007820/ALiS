import { baselineConfig } from '../config/baseline.config.js';
import { ensurePageOpen, waitForPageTimeout } from '../utils/pageGuards.js';

export async function waitForAppIdle(page) {
  ensurePageOpen(page, 'waiting for app idle');

  await page.waitForLoadState('domcontentloaded', {
    timeout: baselineConfig.timeouts.navigationMs,
  }).catch(() => {});

  await waitForBusyIndicators(page);

  await page.waitForLoadState('networkidle', {
    timeout: baselineConfig.timeouts.appIdleNetworkMs,
  }).catch(() => {});

  await waitForBusyIndicators(page);
  await waitForPageTimeout(page, baselineConfig.timeouts.captureStabilizeMs, 'app idle stabilization');
}

export async function openBusinessEntityMenu(page, actionName, { businessUnit } = {}) {
  const attempts = 4;
  let lastError;
  const preferredActionIndexes = businessEntityActionIndexes(businessUnit, actionName);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await waitForAppIdle(page);

      if (!preferredActionIndexes.length && await clickBusinessEntityAction(page, actionName)) {
        await waitForAppIdle(page);
        return;
      }

      const menuPaths = businessEntityMenuPaths(businessUnit);
      for (const menuPath of menuPaths) {
        if (await openMenuPath(page, [...menuPath, actionName], { actionIndexes: preferredActionIndexes })) {
          await waitForAppIdle(page);
          return;
        }
      }

      if (await clickBusinessEntityActionByDom(page, actionName)) {
        await waitForAppIdle(page);
        return;
      }

      throw new Error(
        `Could not open Business Entity -> ${actionName}. Tried menu paths: ${menuPaths.map((path) => path.join(' > ')).join('; ')}. Visible navigation: ${await visibleNavigationSummary(page)}`,
      );
    } catch (error) {
      lastError = error;
      await waitForPageTimeout(page, 1000, 'menu retry delay');
    }
  }

  throw lastError || new Error(`Could not open Business Entity -> ${actionName}.`);
}

function businessEntityActionIndexes(businessUnit, actionName) {
  const configured = businessUnit?.businessEntityActionIndexes?.[actionName]
    ?? businessUnit?.businessEntityActionIndexes?.[String(actionName).toLowerCase()]
    ?? businessUnit?.businessEntityActionCandidateIndexes?.[actionName]
    ?? [];

  return Array.isArray(configured)
    ? configured.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0)
    : [Number(configured)].filter((item) => Number.isInteger(item) && item >= 0);
}

function businessEntityMenuPaths(businessUnit) {
  const configuredPaths = [
    ...(businessUnit?.businessEntityMenuPaths || []),
    ...(businessUnit?.menuPaths?.businessEntity || []),
    ...(baselineConfig.navigation?.businessEntityMenuPaths || []),
  ];

  return uniquePathList(configuredPaths)
    .map((path) => normalizePath(path))
    .filter((path) => path.length);
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    return path.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(path || '')
    .split('>')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniquePathList(paths) {
  const seen = new Set();
  const unique = [];

  for (const path of paths) {
    const normalized = normalizePath(path);
    const key = normalized.map((item) => item.toLowerCase()).join('>');
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

async function openMenuPath(page, pathParts, { actionIndexes = [] } = {}) {
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const menuName = pathParts[index];
    const nextName = pathParts[index + 1];

    if (!await revealMenuItem(page, menuName, nextName)) {
      return false;
    }

    await waitForPageTimeout(page, 200, 'menu reveal delay');
  }

  return clickMenuAction(page, pathParts[pathParts.length - 1], { indexes: actionIndexes });
}

async function revealMenuItem(page, menuName, nextName) {
  try {
    const candidates = menuTextCandidates(page, menuName);
    const count = await candidates.count();

    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      if (!(await isLocatorVisible(locator))) {
        continue;
      }

      await locator.hover({ timeout: menuStepTimeout() }).catch(() => {});
      await waitForPageTimeout(page, 150, 'menu hover delay');
      if (await isAnyMenuCandidateVisible(page, nextName)) {
        return true;
      }

      await locator.click({ timeout: menuStepTimeout() }).catch(() => {});
      await waitForPageTimeout(page, 150, 'menu click delay');
      if (await isAnyMenuCandidateVisible(page, nextName)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function isAnyMenuCandidateVisible(page, text) {
  const candidates = menuTextCandidates(page, text);
  const count = await candidates.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    if (await isLocatorVisible(candidates.nth(index))) {
      return true;
    }
  }

  return false;
}

async function isLocatorVisible(locator) {
  try {
    return (await locator.count()) > 0 && await locator.isVisible();
  } catch {
    return false;
  }
}

async function clickBusinessEntityAction(page, actionName) {
  return clickMenuAction(page, actionName, { direct: true });
}

async function clickMenuAction(page, actionName, { direct = false, indexes = [] } = {}) {
  for (const index of indexes) {
    const preferred = menuActionCandidates(page, actionName).nth(index);
    if (await clickIfReady(preferred, menuStepTimeout())) {
      return true;
    }
  }

  const candidates = [
    page.getByRole('link', { name: actionName, exact: true }).first(),
    page.getByRole('button', { name: actionName, exact: true }).first(),
    menuCandidate(page, actionName),
  ];

  for (const candidate of candidates) {
    if (await clickIfReady(candidate, direct ? 1_500 : menuStepTimeout())) {
      return true;
    }
  }

  return false;
}

function menuActionCandidates(page, text) {
  const exactText = escapeRegex(text);
  const exactTextPattern = new RegExp(`^\\s*${exactText}\\s*$`);

  return page
    .locator('a, button, [role="link"], [role="menuitem"]')
    .filter({ hasText: exactTextPattern });
}

function menuCandidate(page, text) {
  return menuTextCandidates(page, text).first();
}

function menuTextCandidates(page, text) {
  const exactText = escapeRegex(text);
  const exactTextPattern = new RegExp(`^\\s*${exactText}\\s*$`);

  return page
    .locator('a, button, [role="link"], [role="menuitem"], td, span, div')
    .filter({ hasText: exactTextPattern });
}

async function clickBusinessEntityActionByDom(page, actionName) {
  return page.evaluate((targetActionName) => {
    const wanted = clean(targetActionName);
    const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="menuitem"]'))
      .map((element) => ({
        element,
        text: clean(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || ''),
        href: clean(element.getAttribute('href') || ''),
        onclick: clean(element.getAttribute('onclick') || ''),
        scope: clean(ancestorText(element)),
      }))
      .filter((candidate) => candidate.text === wanted);

    const scored = candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreCandidate(candidate),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    const selected = scored[0]?.element;
    if (!selected) {
      return false;
    }

    selected.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    selected.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    selected.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    selected.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    selected.click();
    return true;

    function scoreCandidate(candidate) {
      let score = 0;
      const combined = `${candidate.href} ${candidate.onclick} ${candidate.scope}`;

      if (/business\s*entity/i.test(combined)) score += 5;
      if (/businessentity|business_entity|entityprofile|beinformation|beprofile/i.test(combined)) score += 4;
      if (/new|modify|view/i.test(candidate.text)) score += 1;
      if (isVisible(candidate.element)) score += 2;

      return score;
    }

    function ancestorText(element) {
      const parts = [];
      let current = element;

      for (let depth = 0; current && depth < 5; depth += 1) {
        parts.push(current.textContent || '');
        parts.push(current.getAttribute?.('href') || '');
        parts.push(current.getAttribute?.('onclick') || '');
        current = current.parentElement;
      }

      return parts.join(' ');
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
  }, actionName).catch(() => false);
}

async function visibleNavigationSummary(page) {
  return page.evaluate(() => {
    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    return Array.from(document.querySelectorAll('a, button, [role="link"], [role="menuitem"]'))
      .filter(isVisible)
      .map((element) => String(element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 30)
      .join(' | ');
  }).catch(() => '');
}

async function waitForBusyIndicators(page) {
  const busySelector = [
    '.ngx-spinner-overlay',
    '.block-ui-wrapper',
    '.blockUI',
    '.loading',
    '.loader',
    '.spinner',
    '.k-loading-mask',
    '.ui-widget-overlay',
    '[class*="spinner"]',
    '[class*="loading"]',
    '[id*="spinner"]',
    '[id*="loading"]',
  ].join(',');

  await page.waitForFunction((selector) => {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.every((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width === 0
        || rect.height === 0
      );
    });
  }, busySelector, {
    timeout: baselineConfig.timeouts.appBusyMs || baselineConfig.timeouts.navigationMs,
  }).catch(() => {});
}

async function clickIfReady(locator, timeoutMs = baselineConfig.timeouts.actionMs) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    if (!(await locator.isVisible())) {
      return false;
    }

    await locator.click({
      timeout: timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

function menuStepTimeout() {
  return baselineConfig.timeouts.menuStepMs || baselineConfig.timeouts.actionMs;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
