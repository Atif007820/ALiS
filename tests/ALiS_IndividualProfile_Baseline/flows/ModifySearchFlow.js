import { baselineConfig } from '../config/baseline.config.js';
import { openIndividualProfileMenu, waitForAppIdle } from './navigation.js';
import { logger } from '../utils/logger.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';

export async function openProfileFromModifySearch(page, options) {
  return openProfileFromSearch(page, {
    ...options,
    actionName: 'Modify',
  });
}

export async function openProfileFromViewSearch(page, options) {
  return openProfileFromSearch(page, {
    ...options,
    actionName: 'View',
  });
}

export const openEntityFromModifySearch = openProfileFromModifySearch;
export const openEntityFromViewSearch = openProfileFromViewSearch;

export async function openProfileFromSearch(page, {
  businessUnit,
  profileName,
  firstName,
  lastName,
  actionName = 'Modify',
}) {
  const resolvedProfile = normalizeProfileName(profileName || { firstName, lastName });

  if (!resolvedProfile.firstName || !resolvedProfile.lastName) {
    throw new Error(`First Name and Last Name are required for ${actionName} search.`);
  }

  await openIndividualProfileMenu(page, actionName, { businessUnit });
  await waitForSearchFields(page);
  await fillSearchFields(page, resolvedProfile);
  await clickSearch(page);
  await waitForAppIdle(page);

  if (await waitForProfileWorkspace(page, resolvedProfile.fullName, {
    timeout: 2_500,
    required: false,
    settle: false,
  })) {
    logger.info(`${actionName} search opened the profile workspace directly for "${resolvedProfile.fullName}".`);
    return profileResult(resolvedProfile);
  }

  await waitForSearchResults(page);
  await clickProfileResult(page, resolvedProfile);
  await waitForProfileWorkspace(page, resolvedProfile.fullName);

  return profileResult(resolvedProfile);
}

async function waitForSearchFields(page) {
  await Promise.any([
    page.getByRole('textbox', { name: 'Last Name' }).first().waitFor({
      state: 'visible',
      timeout: baselineConfig.timeouts.navigationMs,
    }),
    page.getByRole('textbox', { name: 'First Name' }).first().waitFor({
      state: 'visible',
      timeout: baselineConfig.timeouts.navigationMs,
    }),
  ]).catch(() => {
    throw new Error('Individual profile search fields were not available.');
  });
}

async function fillSearchFields(page, profileName) {
  await fillTextbox(page, 'Last Name', profileName.lastName);
  await fillTextbox(page, 'First Name', profileName.firstName);
}

async function fillTextbox(page, name, value) {
  const candidates = [
    page.getByRole('textbox', { name, exact: true }).first(),
    page.getByRole('textbox', { name }).first(),
    page.getByLabel(name, { exact: true }).first(),
    page.getByLabel(name).first(),
  ];

  for (const candidate of candidates) {
    if (await fillIfVisible(candidate, value)) {
      return;
    }
  }

  throw new Error(`Could not find individual profile search field: ${name}`);
}

async function clickSearch(page) {
  const candidates = [
    page.getByRole('button', { name: 'Search', exact: true }).first(),
    page.getByRole('link', { name: 'Search', exact: true }).first(),
    page.locator('input[type="submit"][value="Search"], input[type="button"][value="Search"]').first(),
  ];

  for (const candidate of candidates) {
    if (await clickIfVisible(candidate)) {
      return;
    }
  }

  throw new Error('Could not find individual profile Search control.');
}

async function waitForSearchResults(page) {
  const timeout = baselineConfig.timeouts.searchResultsMs;
  const waits = [
    page.getByRole('heading', { name: 'Search Results' }).waitFor({ state: 'visible', timeout }),
    page.locator('table').first().waitFor({ state: 'visible', timeout }),
    page.getByText(/No matching record\(s\) found/i).first().waitFor({ state: 'visible', timeout }),
  ].map((wait) => wait.then(() => true));

  return Promise.any(waits).catch(() => false);
}

async function clickProfileResult(page, profileName) {
  const candidateNames = [
    `${profileName.firstName} ${profileName.lastName}`,
    `${profileName.lastName} ${profileName.firstName}`,
    profileName.fullName,
  ];

  for (const name of candidateNames) {
    const exactLink = page.getByRole('link', { name, exact: true }).first();
    if (await clickResultCandidate(page, exactLink)) {
      return;
    }

    const flexibleLink = page.locator('a').filter({ hasText: flexibleTextPattern(name) }).first();
    if (await clickResultCandidate(page, flexibleLink)) {
      return;
    }

    const row = page.locator('tr, div[role="row"]').filter({ hasText: flexibleTextPattern(name) }).first();
    if (await clickResultCandidate(page, row)) {
      return;
    }
  }

  if (await clickNormalizedProfileResult(page, profileName)) {
    return;
  }

  throw new Error(`Could not find a clickable ${profileName.fullName} individual profile search result.`);
}

async function clickResultCandidate(page, locator) {
  if (!await isValidSearchResultCandidate(locator)) {
    return false;
  }

  await locator.click();
  await waitForAppIdle(page);
  return true;
}

async function clickNormalizedProfileResult(page, profileName) {
  const clicked = await page.evaluate(({ firstName, lastName }) => {
    const wanted = [firstName, lastName].map(clean).filter(Boolean);
    const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"], tr, [role="row"]'))
      .filter((element) => isVisible(element) && !isHeaderLike(element))
      .map((element) => ({
        element,
        text: clean(element.innerText || element.textContent),
      }))
      .filter((candidate) => wanted.every((part) => candidate.text.includes(part)));

    const target = candidates
      .map((candidate) => {
        const clickable = clickableChild(candidate.element, wanted) || candidate.element;
        return {
          element: clickable,
          score: scoreCandidate(candidate.text, wanted, clickable),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element;

    if (!target) return false;
    target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    target.click?.();
    return true;

    function clickableChild(element, parts) {
      if (matchesClickable(element, parts)) return element;
      return Array.from(element.querySelectorAll('a, button, [role="link"], [role="button"]'))
        .find((item) => matchesClickable(item, parts)) || null;
    }

    function matchesClickable(element, parts) {
      const text = clean(element.innerText || element.textContent);
      return isVisible(element) && parts.every((part) => text.includes(part));
    }

    function scoreCandidate(text, parts, element) {
      let score = 0;
      if (parts.every((part) => text.includes(part))) score += 50;
      if (element.matches?.('a, button, [role="link"], [role="button"]')) score += 30;
      return score - text.length * 0.01;
    }

    function isHeaderLike(element) {
      const row = element.closest?.('tr, [role="row"]');
      return Boolean(row?.querySelector?.('th, [role="columnheader"]'))
        || /ui-grid-header|header/i.test(row?.className || element.className || '');
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, profileName).catch(() => false);

  if (!clicked) {
    return false;
  }

  await waitForAppIdle(page);
  return true;
}

async function isValidSearchResultCandidate(locator) {
  try {
    if ((await locator.count()) === 0 || !(await locator.isVisible())) {
      return false;
    }

    const text = normalizeText(await locator.innerText({ timeout: 1_000 }).catch(() => ''));
    if (!text || /no matching record\(s\) found/i.test(text)) {
      return false;
    }

    const role = await locator.evaluate((element) => {
      const row = element.closest?.('tr, [role="row"]');
      const hasHeaderCell = Boolean(row?.querySelector?.('th, [role="columnheader"]'));
      const isHeaderLike = /ui-grid-header|header/i.test(row?.className || element.className || '');

      return { hasHeaderCell, isHeaderLike };
    }).catch(() => ({ hasHeaderCell: false, isHeaderLike: false }));

    return !role.hasHeaderCell && !role.isHeaderLike;
  } catch {
    return false;
  }
}

export async function waitForProfileWorkspace(page, profileName, {
  timeout = baselineConfig.timeouts.navigationMs,
  required = true,
  settle = true,
} = {}) {
  const ready = await waitForWorkspaceSignal(page, timeout);

  if (!ready) {
    if (!required) {
      return false;
    }

    throw new Error(`Individual profile workspace did not become ready after opening "${profileName}". Capture cannot start from the current page.`);
  }

  if (settle) {
    await waitForAppIdle(page);
  }

  return true;
}

export const waitForEntityWorkspace = waitForProfileWorkspace;

async function waitForWorkspaceSignal(page, timeout) {
  const tabSelectors = baselineConfig.capture.tabSelectors.join(',');
  const workspaceConfig = baselineConfig.workspace || {};
  const entityInfoTabPattern = new RegExp(workspaceConfig.entityInfoTabPattern || '^Entity Information$', 'i');
  const readyTextPatterns = workspaceConfig.readyTextPatterns?.length
    ? workspaceConfig.readyTextPatterns
    : ['Return to Search'];
  const entityInfoTab = page.locator(tabSelectors).filter({ hasText: entityInfoTabPattern }).first();
  const readyTextLocator = readyTextPatterns
    .map((pattern) => new RegExp(pattern, 'i'))
    .reduce((locator, pattern) => {
      const candidate = page.getByRole('link', { name: pattern }).first()
        .or(page.getByText(pattern).first());
      return locator ? locator.or(candidate) : candidate;
    }, null);

  const readyByLocator = await entityInfoTab
    .or(readyTextLocator)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);

  if (!readyByLocator) {
    return false;
  }

  return page.evaluate(({ selectors, workspace }) => {
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = cleanText(document.body?.innerText || '');
    const regexFrom = (pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch {
        return /$a/;
      }
    };
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };

    const tabTexts = Array.from(document.querySelectorAll(selectors))
      .filter(visible)
      .map((element) => cleanText(element.innerText || element.textContent));
    const entityInfoTabRegex = regexFrom(workspace.entityInfoTabPattern || '^Entity Information$');
    const readyTextRegexes = (workspace.readyTextPatterns || ['Return to Search']).map(regexFrom);
    const profileIdentifierRegexes = (workspace.profileIdentifierPatterns || ['\\b(?:Individual|Licensee)\\s+I[Dd]\\b']).map(regexFrom);
    const nonWorkspacePageRegexes = (workspace.nonWorkspacePagePatterns || []).map(regexFrom);
    const minProfileTabs = Number(workspace.minProfileTabs || 2);

    const hasEntityInfoTab = tabTexts.some((text) => entityInfoTabRegex.test(text));
    const hasMultipleProfileTabs = tabTexts.filter(Boolean).length >= minProfileTabs;
    const hasReadyText = readyTextRegexes.some((regex) => regex.test(bodyText));
    const hasProfileIdentifier = profileIdentifierRegexes.some((regex) => regex.test(bodyText));
    const isCreateOrSearchPage = nonWorkspacePageRegexes.some((regex) => regex.test(bodyText))
      && !hasReadyText;

    return !isCreateOrSearchPage
      && (
        (hasEntityInfoTab && hasMultipleProfileTabs)
        || (hasReadyText && (hasProfileIdentifier || hasMultipleProfileTabs))
      );
  }, {
    selectors: tabSelectors,
    workspace: workspaceConfig,
  }).catch(() => false);
}

function normalizeProfileName(profileName) {
  if (typeof profileName === 'string') {
    const parts = profileName.trim().split(/\s+/);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      fullName: profileName.trim(),
    };
  }

  const firstName = String(profileName?.firstName || '').trim();
  const lastName = String(profileName?.lastName || '').trim();

  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' '),
  };
}

function profileResult(profileName) {
  return {
    ...profileName,
    entityName: profileName.fullName,
    profileName,
  };
}

async function fillIfVisible(locator, value) {
  try {
    if ((await locator.count()) === 0 || !(await locator.isVisible())) {
      return false;
    }

    await locator.fill(value);
    return true;
  } catch {
    return false;
  }
}

async function clickIfVisible(locator) {
  try {
    if ((await locator.count()) === 0 || !(await locator.isVisible())) {
      return false;
    }

    await locator.click();
    return true;
  } catch {
    return false;
  }
}

function flexibleTextPattern(value) {
  const escaped = escapeRegex(value).replace(/\s+/g, '\\s+');
  return new RegExp(escaped, 'i');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
