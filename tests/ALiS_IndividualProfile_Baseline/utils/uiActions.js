import { waitForPageTimeout } from './pageGuards.js';

export async function runUiActions(page, actions = [], context = {}) {
  for (const action of actions) {
    await runUiAction(page, action, context);
  }
}

export async function ensureUiActionValues(page, actions = [], context = {}, {
  attempts = 3,
  settleMs = 500,
} = {}) {
  const valueActions = actions.filter(isVerifiableValueAction);
  if (!valueActions.length) {
    return;
  }

  let mismatches = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    mismatches = [];

    for (const action of valueActions) {
      const locator = locatorForValueAction(page, action);
      const available = await locator.count().catch(() => 0);

      if (!available) {
        if (!action.optional) {
          mismatches.push(actionDescription(action));
        }
        continue;
      }

      const expected = await expectedValueForAction(locator, action, context);
      const actual = await locator.inputValue({ timeout: 3_000 }).catch(() => '');

      if (String(actual) === String(expected)) {
        continue;
      }

      await runUiAction(page, action, context);
      const restored = await locator.inputValue({ timeout: 3_000 }).catch(() => '');
      if (String(restored) !== String(expected)) {
        mismatches.push(actionDescription(action));
      }
    }

    await waitForPageTimeout(page, settleMs, 'pre-save form value stabilization');

    const unstable = [];
    for (const action of valueActions) {
      const locator = locatorForValueAction(page, action);
      const available = await locator.count().catch(() => 0);

      if (!available) {
        if (!action.optional) {
          unstable.push(actionDescription(action));
        }
        continue;
      }

      const expected = await expectedValueForAction(locator, action, context);
      const actual = await locator.inputValue({ timeout: 3_000 }).catch(() => '');
      if (String(actual) !== String(expected)) {
        unstable.push(actionDescription(action));
      }
    }

    if (!unstable.length) {
      return;
    }

    mismatches = unstable;
  }

  throw new Error(
    `Required create form values did not remain stable before Save: ${[...new Set(mismatches)].join(', ')}`,
  );
}

export async function runUiAction(page, action, context = {}) {
  const value = resolveValue(action.value, context);

  if (action.type === 'textbox') {
    await page.getByRole('textbox', {
      name: action.name,
      exact: action.exact ?? false,
    }).first().fill(value);
    return;
  }

  if (action.type === 'clickTextbox') {
    await page.getByRole('textbox', {
      name: action.name,
      exact: action.exact ?? false,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'clickText') {
    await page.getByText(action.text ?? action.name, {
      exact: action.exact ?? false,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'clickImage') {
    await page.getByRole('img', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'clickOption') {
    await page.getByRole('option', {
      name: action.name,
      exact: action.exact ?? false,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'selectByLabel') {
    await selectConfiguredOption(
      page.getByLabel(action.label, { exact: action.exact ?? false }).first(),
      action,
      value,
      context,
    );
    return;
  }

  if (action.type === 'labelNthFill') {
    await page.getByLabel(action.label, { exact: action.exact ?? false }).nth(action.index || 0).fill(value);
    return;
  }

  if (action.type === 'labelNthSelect') {
    await selectConfiguredOption(
      page.getByLabel(action.label, { exact: action.exact ?? false }).nth(action.index || 0),
      action,
      value,
      context,
    );
    return;
  }

  if (action.type === 'rowSelectByLabel') {
    await selectConfiguredOption(
      page.getByRole('row', {
        name: action.rowName,
        exact: action.rowExact ?? false,
      }).getByLabel(action.label, { exact: action.exact ?? false }).nth(action.index || 0),
      action,
      value,
      context,
    );
    return;
  }

  if (action.type === 'selectAllByLabelText') {
    await selectAllVisibleDropdownsByLabelText(page, action.label, value);
    return;
  }

  if (action.type === 'locatorFill') {
    await fillConfiguredLocator(page.locator(action.selector).first(), value, action);
    return;
  }

  if (action.type === 'locatorFillAll') {
    await fillAllConfiguredLocators(page.locator(action.selector), value, action);
    return;
  }

  if (action.type === 'locatorSetValue') {
    await setElementValue(page.locator(action.selector).first(), value);
    return;
  }

  if (action.type === 'locatorSelect') {
    await selectConfiguredOption(
      page.locator(action.selector).first(),
      action,
      value,
      context,
    );
    return;
  }

  if (action.type === 'locatorClick') {
    await page.locator(action.selector).first().click();
    return;
  }

  if (action.type === 'richTextFill') {
    const editor = page.locator(action.selector).first();
    await editor.click();
    await editor.fill(value);
    return;
  }

  if (action.type === 'radio') {
    await checkConfiguredRadio(page, action);
    return;
  }

  if (action.type === 'checkbox') {
    await checkConfiguredCheckbox(page, action);
    return;
  }

  if (action.type === 'clickLink') {
    await page.getByRole('link', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'openFormFromLink') {
    await openFormFromLink(page, action);
    return;
  }

  if (action.type === 'clickLinkNearText') {
    if (await clickLinkNearText(page, action.nearText, action.name || 'Add')) {
      return;
    }

    await page.getByRole('link', {
      name: action.name || 'Add',
      exact: action.exact ?? true,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'waitForLink') {
    const timeoutMs = Number(action.timeoutMs || 15_000);
    const found = await waitForVisibleActionLink(page, action, timeoutMs);
    if (!found) {
      throw new Error(`Visible link "${action.name}" was not available within ${timeoutMs}ms.`);
    }
    return;
  }

  if (action.type === 'clickButton') {
    await page.getByRole('button', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0).click();
    return;
  }

  if (action.type === 'clickReceiptSearchIcon') {
    await clickReceiptSearchIcon(page, action);
    return;
  }

  if (action.type === 'clickRandomReceiptSearchResult') {
    await clickRandomReceiptSearchResult(page, action);
    return;
  }

  if (action.type === 'selectRandomReceiptSearchResultAndSave') {
    await selectRandomReceiptSearchResultAndSave(page, action);
    return;
  }

  if (action.type === 'clickRandomNameSearchResult') {
    await clickRandomNameSearchResult(page, action);
    return;
  }

  if (action.type === 'dismissNextDialog') {
    page.once('dialog', async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });
    return;
  }

  if (action.type === 'reloadCurrentPage') {
    await reloadCurrentPage(page, action);
    return;
  }

  if (action.type === 'popupFromLink') {
    await runPopupFromLink(page, action, context);
    return;
  }

  if (action.type === 'popupFromLocator') {
    await runPopupFromLocator(page, action, context);
    return;
  }

  if (action.type === 'wait') {
    await waitForPageTimeout(page, Number(action.ms || 500), 'configured UI action wait');
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    return;
  }

  throw new Error(`Unsupported UI action type: ${action.type}`);
}

async function clickReceiptSearchIcon(page, action = {}) {
  const timeoutMs = Number(action.timeoutMs || 15_000);
  const candidates = [
    page.getByRole('img', {
      name: action.name || 'Search Receipt',
      exact: action.exact ?? false,
    }).first(),
    page.getByRole('row', {
      name: action.rowName ? new RegExp(escapeRegExp(action.rowName), 'i') : /Search\s+Receipt/i,
    }).getByRole('img').nth(action.index || 0),
    page.locator('tr').filter({ hasText: /Search\s+Receipt/i }).locator('img, input[type="image"], button').nth(action.index || 0),
    page.locator('img[alt*="Search" i], img[title*="Search" i], input[type="image"][alt*="Search" i], input[type="image"][title*="Search" i]').nth(action.index || 0),
  ];

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const locator of candidates) {
      if (await clickIfVisible(locator)) {
        await waitForPageTimeout(page, Number(action.settleMs || 500), 'receipt search icon click');
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        return;
      }
    }

    if (await clickReceiptSearchIconByDom(page, action.rowName || 'Search Receipt', action.index || 0)) {
      await waitForPageTimeout(page, Number(action.settleMs || 500), 'receipt search icon DOM click');
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      return;
    }

    await wait(250);
  }

  throw new Error('Receipt search icon was not available before the receipt search grid.');
}

async function clickReceiptSearchIconByDom(page, rowText, index) {
  return page.evaluate(({ rowText, index }) => {
    const wanted = normalize(rowText);
    const rows = Array.from(document.querySelectorAll('tr, [role="row"]')).filter((row) => (
      isVisible(row) && normalize(row.textContent).includes(wanted)
    ));

    for (const row of rows) {
      const controls = Array.from(row.querySelectorAll(
        'img, input[type="image"], button, a, [role="button"]',
      )).filter(isVisible);

      const preferred = controls.filter((control) => {
        const label = normalize([
          control.textContent,
          control.getAttribute('alt'),
          control.getAttribute('aria-label'),
          control.getAttribute('title'),
          control.getAttribute('name'),
          control.id,
        ].filter(Boolean).join(' '));
        return /search/.test(label) || control.tagName.toLowerCase() === 'img';
      });

      const target = preferred[index] || preferred[0] || controls[index] || controls[0];
      if (target) {
        target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        target.click?.();
        return true;
      }
    }

    return false;

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }

    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, { rowText, index }).catch(() => false);
}

async function selectRandomReceiptSearchResultAndSave(page, action = {}) {
  const timeoutMs = Number(action.timeoutMs || 30_000);
  const state = await waitForReceiptSearchResultState(page, timeoutMs);

  if (state === 'empty') {
    if (!action.allowNoRecords) {
      throw new Error('Receipt search returned no records.');
    }

    await closeReceiptSearchDialog(page);
    return;
  }

  if (state !== 'records') {
    if (action.allowNoRecords) {
      await closeReceiptSearchDialog(page).catch(() => {});
      return;
    }

    throw new Error('Receipt search results did not become available.');
  }

  await clickRandomReceiptSearchResult(page, {
    ...action,
    timeoutMs: Math.min(timeoutMs, 5_000),
  });
  await closeReceiptSearchDialog(page, { optional: true });

  if (action.dismissDialog !== false) {
    page.once('dialog', async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });
  }

  const saved = await clickFirstVisible(page, [
    (targetPage) => targetPage.getByRole('button', { name: 'Save', exact: true }).first(),
    (targetPage) => targetPage.getByRole('link', { name: 'Save', exact: true }).first(),
    (targetPage) => targetPage.getByRole('button', { name: 'Save', exact: false }).first(),
    (targetPage) => targetPage.getByRole('link', { name: 'Save', exact: false }).first(),
  ]);

  if (!saved) {
    throw new Error('Payment receipt was selected, but the Save control was not available.');
  }

  await waitForPageTimeout(page, Number(action.settleMs || 750), 'payment receipt save');
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
}

async function waitForReceiptSearchResultState(page, timeoutMs) {
  return page.waitForFunction(() => {
    if (receiptDateLinks().length > 0) {
      return 'records';
    }

    if (/No\s+Record\s+Found/i.test(document.body.innerText || '')) {
      return 'empty';
    }

    return '';

    function receiptDateLinks() {
      return Array.from(document.querySelectorAll([
        '#ReceiptSearchResult a[data-action-type="ReceiptDateClick"]',
        'cc-receipt-search-results a[data-action-type="ReceiptDateClick"]',
        '#ReceiptSearchResult span[id^="ValidationDate"] a',
        'cc-receipt-search-results span[id^="ValidationDate"] a',
      ].join(','))).filter((element) => {
        const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        return /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && isVisible(element);
      });
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }
  }, null, { timeout: timeoutMs })
    .then((handle) => handle.jsonValue())
    .catch(() => '');
}

async function closeReceiptSearchDialog(page, { optional = false } = {}) {
  const closed = await clickFirstVisible(page, [
    (targetPage) => targetPage.locator('.modal.show, .modal, [role="dialog"]').getByRole('button', { name: /^Close$/i }).first(),
    (targetPage) => targetPage.getByRole('button', { name: /^Close$/i }).first(),
    (targetPage) => targetPage.locator('.modal.show, .modal, [role="dialog"]').getByLabel(/^Close$/i).first(),
  ]);

  if (!closed && !optional) {
    throw new Error('Receipt search returned no records, but the Close control was not available.');
  }

  if (closed) {
    await waitForPageTimeout(page, 500, 'receipt search dialog close');
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
  }
}

async function clickRandomReceiptSearchResult(page, action = {}) {
  const timeoutMs = Number(action.timeoutMs || 30_000);
  const settleMs = Number(action.settleMs || 750);

  await page.waitForFunction(() => {
    return receiptDateLinks().length > 0;

    function receiptDateLinks() {
      return Array.from(document.querySelectorAll([
        '#ReceiptSearchResult a[data-action-type="ReceiptDateClick"]',
        'cc-receipt-search-results a[data-action-type="ReceiptDateClick"]',
        '#ReceiptSearchResult span[id^="ValidationDate"] a',
        'cc-receipt-search-results span[id^="ValidationDate"] a',
      ].join(','))).filter((element) => {
        const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        return /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && isVisible(element);
      });
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }
  }, null, { timeout: timeoutMs });

  const clickedDate = await page.evaluate(() => {
    const links = receiptDateLinks();
    if (!links.length) return '';

    const index = Math.floor(Math.random() * links.length);
    const link = links[index];
    const text = String(link.textContent || '').replace(/\s+/g, ' ').trim();
    link.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    link.click?.();
    return text;

    function receiptDateLinks() {
      return Array.from(document.querySelectorAll([
        '#ReceiptSearchResult a[data-action-type="ReceiptDateClick"]',
        'cc-receipt-search-results a[data-action-type="ReceiptDateClick"]',
        '#ReceiptSearchResult span[id^="ValidationDate"] a',
        'cc-receipt-search-results span[id^="ValidationDate"] a',
      ].join(','))).filter((element) => {
        const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        return /\d{1,2}\/\d{1,2}\/\d{4}/.test(text) && isVisible(element);
      });
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }
  });

  if (!clickedDate) {
    throw new Error('No clickable receipt date was available in the receipt search results grid.');
  }

  await waitForPageTimeout(page, settleMs, `receipt search result selection (${clickedDate})`);
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
}

async function clickRandomNameSearchResult(page, action = {}) {
  const timeoutMs = Number(action.timeoutMs || 30_000);
  const settleMs = Number(action.settleMs || 750);
  const finderSource = searchResultNameLinks.toString();

  await page.waitForFunction((source) => {
    const findLinks = Function(`return (${source})`)();
    return findLinks().length > 0;
  }, finderSource, { timeout: timeoutMs });

  const clickedName = await page.evaluate((source) => {
    const findLinks = Function(`return (${source})`)();
    const links = findLinks();
    if (!links.length) return '';

    const index = Math.floor(Math.random() * links.length);
    const link = links[index];
    const text = String(link.textContent || '').replace(/\s+/g, ' ').trim();
    link.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    link.click?.();
    return text;
  }, finderSource);

  if (!clickedName) {
    throw new Error('No clickable Name result was available in the search results grid.');
  }

  await waitForPageTimeout(page, settleMs, `name search result selection (${clickedName})`);
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
}

function searchResultNameLinks() {
  const selectors = [
    'sh-custom-grid a[data-action-type="Name"]',
    'sh-custom-grid span[id*="Name"] a',
    '.custom-table-wrapper a[data-action-type="Name"]',
    '.custom-table-wrapper td:first-child a',
  ];

  return Array.from(document.querySelectorAll(selectors.join(','))).filter((element) => {
    const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    return text && isElementVisible(element) && !isExportLink(element);
  });

  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  function isExportLink(element) {
    return /export/i.test(String(element.textContent || '').trim())
      || /export/i.test(String(element.getAttribute('title') || ''));
  }
}

export async function clickFirstVisible(page, candidates) {
  for (const candidate of candidates) {
    if (await clickIfVisible(candidate(page))) {
      return true;
    }
  }

  return false;
}

async function runPopupFromLink(page, action, context) {
  const timeoutMs = Number(action.popupTimeoutMs || 5_000);
  const attempts = Number(action.attempts || 2);
  const retryDelayMs = Number(action.retryDelayMs || 750);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let targetPage = null;

    try {
      targetPage = await openPopupTargetFromLink(page, action, timeoutMs);

      if (!targetPage) {
        throw new Error(`Popup "${action.name}" did not open or did not contain the expected first control.`);
      }

      await targetPage.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      await runUiActions(targetPage, action.actions || [], context);

      if (targetPage !== page) {
        await targetPage.waitForEvent('close', { timeout: 5_000 }).catch(() => {});
      }

      await waitForAspNetPostback(page, {
        minimumWaitMs: Number(action.parentPostbackWaitMs || action.settleMs || 750),
        timeoutMs: Number(action.parentPostbackTimeoutMs || 15_000),
      }).catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

      return;
    } catch (error) {
      lastError = error;

      if (targetPage && targetPage !== page && !targetPage.isClosed()) {
        await targetPage.close().catch(() => {});
      }

      if (attempt < attempts) {
        await wait(retryDelayMs);
      }
    }
  }

  throw new Error(`Popup action "${action.name}" failed after ${attempts} attempt(s): ${lastError?.message || lastError}`);
}

async function openFormFromLink(page, action) {
  const attempts = Number(action.attempts || 3);
  const timeoutMs = Number(action.timeoutMs || 10_000);
  const retryDelayMs = Number(action.retryDelayMs || 750);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});

      const clicked = await clickFirstVisibleRoleLink(page, action);
      if (!clicked) {
        throw new Error(`Visible link "${action.name}" was not available.`);
      }

      const expectedControl = action.expectedSelector
        ? page.locator(action.expectedSelector).first()
        : page.getByLabel(action.expectedLabel, {
          exact: action.expectedExact ?? false,
        }).first();

      await expectedControl.waitFor({
        state: 'visible',
        timeout: timeoutMs,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(retryDelayMs);
      }
    }
  }

  throw new Error(
    `Could not open form from link "${action.name}" after ${attempts} attempt(s): ${lastError?.message || lastError}`,
  );
}

async function clickFirstVisibleRoleLink(page, action) {
  for (const links of actionLinkLocators(page, action)) {
    const count = Math.min(await links.count().catch(() => 0), 25);

    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      if (!(await link.isVisible().catch(() => false))) {
        continue;
      }

      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ noWaitAfter: true, timeout: Number(action.clickTimeoutMs || 10_000) });
      return true;
    }
  }

  return clickActionLinkByDomText(page, action);
}

async function waitForVisibleActionLink(page, action, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const links of actionLinkLocators(page, action)) {
      const count = Math.min(await links.count().catch(() => 0), 25);

      for (let index = 0; index < count; index += 1) {
        if (await links.nth(index).isVisible().catch(() => false)) {
          return true;
        }
      }
    }

    if (await hasVisibleActionLinkByDomText(page, action)) {
      return true;
    }

    await wait(250);
  }

  return false;
}

function actionLinkLocators(page, action) {
  const exact = action.exact ?? true;
  const locators = [
    page.getByRole('link', { name: action.name, exact }),
  ];

  if (exact) {
    locators.push(page.getByRole('link', { name: action.name, exact: false }));
  }

  locators.push(
    page.locator('a, [role="link"], button').filter({ hasText: action.name }),
    page.getByText(action.name, { exact }).locator('xpath=ancestor-or-self::a[1]'),
  );

  if (exact) {
    locators.push(page.getByText(action.name, { exact: false }).locator('xpath=ancestor-or-self::a[1]'));
  }

  return locators;
}

async function hasVisibleActionLinkByDomText(page, action) {
  return findActionLinkByDomText(page, action, false);
}

async function clickActionLinkByDomText(page, action) {
  return findActionLinkByDomText(page, action, true);
}

async function findActionLinkByDomText(page, action, shouldClick) {
  return page.evaluate(({ name, exact, shouldClick }) => {
    const wanted = normalize(name);
    const candidates = Array.from(document.querySelectorAll(
      'a, [role="link"], button, input[type="button"], input[type="submit"], input[type="image"]',
    )).filter(isVisible);
    const match = candidates.find((element) => textMatches(labelFor(element), wanted, exact))
      || (exact ? candidates.find((element) => textMatches(labelFor(element), wanted, false)) : null);

    if (!match) {
      return false;
    }

    if (shouldClick) {
      match.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      match.click?.();
    }

    return true;

    function textMatches(text, expected, isExact) {
      if (!text || !expected) {
        return false;
      }

      return isExact ? text === expected : text.includes(expected);
    }

    function labelFor(element) {
      return normalize([
        element.innerText,
        element.textContent,
        element.value,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.id,
        element.name,
      ].filter(Boolean).join(' '));
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }

    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    name: action.name,
    exact: action.exact ?? true,
    shouldClick,
  }).catch(() => false);
}

async function runPopupFromLocator(page, action, context) {
  const timeoutMs = Number(action.popupTimeoutMs || 5_000);
  const attempts = Number(action.attempts || 2);
  const retryDelayMs = Number(action.retryDelayMs || 750);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let targetPage = null;

    try {
      targetPage = await openPopupTargetFromLocator(page, action, timeoutMs);

      if (!targetPage) {
        throw new Error(`Popup from "${action.selector}" did not open or did not contain the expected first control.`);
      }

      await targetPage.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      await runUiActions(targetPage, action.actions || [], context);

      if (targetPage !== page) {
        await targetPage.waitForEvent('close', { timeout: 5_000 }).catch(() => {});
      }

      return;
    } catch (error) {
      lastError = error;

      if (targetPage && targetPage !== page && !targetPage.isClosed()) {
        await targetPage.close().catch(() => {});
      }

      if (attempt < attempts) {
        await wait(retryDelayMs);
      }
    }
  }

  throw new Error(`Popup action from "${action.selector}" failed after ${attempts} attempt(s): ${lastError?.message || lastError}`);
}

async function openPopupTargetFromLink(page, action, timeoutMs) {
  const browserContext = page.context();
  const knownPages = new Set(browserContext.pages());
  const popupPromise = page.waitForEvent('popup', {
    timeout: timeoutMs,
  }).catch(() => null);
  const contextPagePromise = browserContext.waitForEvent('page', {
    timeout: timeoutMs,
  }).catch(() => null);

  const clicked = await clickFirstVisibleRoleLink(page, action);
  if (!clicked) {
    throw new Error(`Visible link "${action.name}" was not available.`);
  }

  await waitForAspNetPostback(page, {
    minimumWaitMs: Number(action.afterClickMinimumWaitMs || 750),
    timeoutMs: Number(action.afterClickTimeoutMs || Math.min(timeoutMs, 15_000)),
  });

  const openedPage = await Promise.race([
    popupPromise,
    contextPagePromise,
    wait(timeoutMs).then(() => null),
  ]);
  const newPages = browserContext.pages().filter((candidate) => !knownPages.has(candidate));
  const popupCandidates = uniquePages([openedPage, ...newPages])
    .filter((candidate) => candidate && !candidate.isClosed());

  if (popupCandidates.length) {
    return await findPageForFirstAction(popupCandidates, action.actions?.[0], timeoutMs)
      || popupCandidates[0];
  }

  return findPageForFirstAction(
    [page],
    action.actions?.[0],
    Number(action.samePageFallbackTimeoutMs || Math.min(timeoutMs, 15_000)),
  );
}

async function reloadCurrentPage(page, action = {}) {
  const timeoutMs = Number(action.timeoutMs || 30_000);
  const currentUrl = page.url();

  await page.goto(currentUrl, {
    waitUntil: action.waitUntil || 'domcontentloaded',
    timeout: timeoutMs,
  }).catch(async () => {
    await page.reload({
      waitUntil: action.waitUntil || 'domcontentloaded',
      timeout: timeoutMs,
    });
  });

  await waitForAspNetPostback(page, {
    minimumWaitMs: Number(action.waitAfterReloadMs || 700),
    timeoutMs,
  });
}

async function openPopupTargetFromLocator(page, action, timeoutMs) {
  const browserContext = page.context();
  const knownPages = new Set(browserContext.pages());
  const popupPromise = page.waitForEvent('popup', {
    timeout: timeoutMs,
  }).catch(() => null);
  const contextPagePromise = browserContext.waitForEvent('page', {
    timeout: timeoutMs,
  }).catch(() => null);

  await page.locator(action.selector).first().click();

  const openedPage = await Promise.race([
    popupPromise,
    contextPagePromise,
    wait(timeoutMs).then(() => null),
  ]);
  const newPages = browserContext.pages().filter((candidate) => !knownPages.has(candidate));
  const popupCandidates = uniquePages([openedPage, ...newPages])
    .filter((candidate) => candidate && !candidate.isClosed());

  if (popupCandidates.length) {
    return await findPageForFirstAction(popupCandidates, action.actions?.[0], timeoutMs)
      || popupCandidates[0];
  }

  return findPageForFirstAction([page], action.actions?.[0], Math.min(timeoutMs, 2_000));
}

async function findPageForFirstAction(pages, firstAction, timeoutMs) {
  if (!firstAction) {
    return pages.find((candidate) => candidate && !candidate.isClosed()) || null;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const candidate of pages) {
      if (!candidate || candidate.isClosed()) {
        continue;
      }

      await candidate.waitForLoadState('domcontentloaded', { timeout: 1_000 }).catch(() => {});
      await waitForAspNetPostback(candidate, {
        minimumWaitMs: 250,
        timeoutMs: 2_000,
      });

      if (await actionAppearsOnPage(candidate, firstAction, 1_000)) {
        return candidate;
      }
    }

    await wait(250);
  }

  return null;
}

function locatorForAction(page, action) {
  if (!action) {
    return null;
  }

  if (action.type === 'textbox') {
    return page.getByRole('textbox', {
      name: action.name,
      exact: action.exact ?? false,
    }).first();
  }

  if (action.type === 'selectByLabel') {
    return page.getByLabel(action.label, { exact: action.exact ?? false }).first();
  }

  if (action.type === 'labelNthFill' || action.type === 'labelNthSelect') {
    return page.getByLabel(action.label, { exact: action.exact ?? false }).nth(action.index || 0);
  }

  if (
    action.type === 'locatorFill'
    || action.type === 'locatorSetValue'
    || action.type === 'locatorSelect'
    || action.type === 'locatorClick'
    || action.type === 'richTextFill'
  ) {
    return page.locator(action.selector).first();
  }

  if (action.type === 'radio') {
    if (action.selector) {
      return page.locator(action.selector).first();
    }

    return page.getByRole('radio', {
      name: action.name,
      exact: action.exact ?? false,
    }).first();
  }

  if (action.type === 'checkbox') {
    if (action.selector) {
      return page.locator(action.selector).first();
    }

    return page.getByRole('checkbox', {
      name: action.name,
      exact: action.exact ?? false,
    }).first();
  }

  if (action.type === 'clickLink') {
    return page.getByRole('link', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0);
  }

  if (action.type === 'openFormFromLink') {
    return page.getByRole('link', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0);
  }

  if (action.type === 'waitForLink') {
    return page.getByRole('link', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0);
  }

  if (action.type === 'clickButton') {
    return page.getByRole('button', {
      name: action.name,
      exact: action.exact ?? true,
    }).nth(action.index || 0);
  }

  return null;
}

async function isVisible(locator, timeoutMs) {
  return locator
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

async function actionAppearsOnPage(page, action, timeoutMs) {
  const locator = locatorForAction(page, action);
  if (locator && await isVisible(locator, timeoutMs)) {
    return true;
  }

  if (action?.type === 'radio') {
    return radioExistsOnPage(page, action);
  }

  if (action?.type === 'checkbox') {
    return checkboxExistsOnPage(page, action);
  }

  return false;
}

function uniquePages(pages) {
  return [...new Set(pages.filter(Boolean))];
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function clickLinkNearText(page, nearText, linkName) {
  if (!nearText) {
    return false;
  }

  return page.evaluate(({ nearText, linkName }) => {
    const wantedSection = normalize(nearText);
    const wantedLink = normalize(linkName);
    const visibleElements = Array.from(document.querySelectorAll('body *')).filter(isVisible);
    const section = visibleElements.find((element) => normalize(element.textContent) === wantedSection)
      || visibleElements.find((element) => normalize(element.textContent).includes(wantedSection));

    if (!section) {
      return false;
    }

    const scopes = candidateScopes(section);
    for (const scope of scopes) {
      const link = Array.from(scope.querySelectorAll('a, button, [role="link"], [role="button"]'))
        .filter(isVisible)
        .find((candidate) => normalize(candidate.textContent || candidate.getAttribute('aria-label')) === wantedLink);

      if (link) {
        link.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        link.click?.();
        return true;
      }
    }

    return false;

    function candidateScopes(element) {
      const scopes = [];
      let current = element;
      for (let depth = 0; current && depth < 6; depth += 1) {
        scopes.push(current);
        if (current.nextElementSibling) scopes.push(current.nextElementSibling);
        current = current.parentElement;
      }
      return scopes;
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }

    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, { nearText, linkName }).catch(() => false);
}

export async function clickIfVisible(locator) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    if (!(await locator.isVisible())) {
      return false;
    }

    await locator.click();
    return true;
  } catch {
    return false;
  }
}

async function setElementValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    element.value = nextValue;
    element.setAttribute('value', nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function selectAllVisibleDropdownsByLabelText(page, labelText, value) {
  const selectedCount = await page.evaluate(({ labelText, value }) => {
    const wantedLabel = normalize(labelText);
    const visibleSelects = Array.from(document.querySelectorAll('select'))
      .filter((select) => isVisible(select) && !select.disabled)
      .filter((select) => normalize(nearbyLabelText(select)).includes(wantedLabel));
    let count = 0;

    for (const select of visibleSelects) {
      const option = Array.from(select.options || []).find((candidate) => candidate.value === value)
        || Array.from(select.options || []).find((candidate) => normalize(candidate.textContent) === normalize(value));

      if (!option) {
        continue;
      }

      select.value = option.value;
      option.selected = true;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
      count += 1;
    }

    return count;

    function nearbyLabelText(select) {
      const parts = [
        select.id,
        select.name,
        select.getAttribute('aria-label'),
        select.getAttribute('title'),
        ...Array.from(select.labels || []).map((label) => label.textContent || ''),
      ];

      const row = select.closest('tr');
      if (row) {
        parts.push(row.textContent || '');
      }

      const cell = select.closest('td, th, .form-group, .row, div');
      if (cell?.previousElementSibling) {
        parts.push(cell.previousElementSibling.textContent || '');
      }

      const parent = select.parentElement;
      if (parent) {
        const siblings = Array.from(parent.childNodes);
        const index = siblings.indexOf(select);
        parts.push(...siblings.slice(Math.max(0, index - 4), index).map((node) => node.textContent || ''));
      }

      return parts.join(' ');
    }

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }

    function normalize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, { labelText, value });

  if (!selectedCount) {
    throw new Error(`No visible dropdowns near label "${labelText}" accepted value "${value}".`);
  }
}

async function fillConfiguredLocator(locator, value, action = {}) {
  if (action.optional) {
    try {
      if ((await locator.count()) === 0) {
        return;
      }

      await locator.waitFor({ state: 'visible', timeout: Number(action.timeoutMs || 5_000) });
    } catch {
      return;
    }
  }

  await locator.fill(value);
}

async function fillAllConfiguredLocators(locator, value, action = {}) {
  const count = await locator.count().catch(() => 0);
  if (!count && !action.optional) {
    throw new Error(`No elements matched selector "${action.selector}".`);
  }

  for (let index = 0; index < count; index += 1) {
    const target = locator.nth(index);
    const visible = await target.isVisible().catch(() => false);
    const enabled = await target.isEnabled().catch(() => false);
    const editable = await target.evaluate((element) => !element.readOnly && !element.disabled).catch(() => false);

    if (!visible || !enabled || !editable) {
      continue;
    }

    await fillConfiguredLocator(target, value, { ...action, optional: true });
  }
}

async function checkConfiguredRadio(page, action) {
  const timeoutMs = Number(action.timeoutMs || 15_000);
  const locators = [];

  if (action.selector) {
    locators.push(page.locator(action.selector).first());
  }

  locators.push(page.getByRole('radio', {
    name: action.name,
    exact: action.exact ?? false,
  }).first());

  locators.push(page.getByLabel(action.name, {
    exact: action.exact ?? false,
  }).first());

  for (const locator of locators) {
    if (await checkRadioLocator(locator, Math.min(timeoutMs, 5_000))) {
      return;
    }
  }

  if (await checkRadioByDomText(page, action)) {
    return;
  }

  throw new Error(`Radio option "${action.name}" was not found.`);
}

async function checkConfiguredCheckbox(page, action) {
  const timeoutMs = Number(action.timeoutMs || 15_000);
  const locators = [];

  if (action.selector) {
    locators.push(page.locator(action.selector).first());
  }

  locators.push(page.getByRole('checkbox', {
    name: action.name,
    exact: action.exact ?? false,
  }).first());

  locators.push(page.getByLabel(action.name, {
    exact: action.exact ?? false,
  }).first());

  for (const locator of locators) {
    if (await checkBoxLocator(locator, Math.min(timeoutMs, 5_000))) {
      return;
    }
  }

  if (await checkBoxByDomText(page, action)) {
    return;
  }

  throw new Error(`Checkbox option "${action.name}" was not found.`);
}

async function checkRadioLocator(locator, timeoutMs) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    await locator.check();
    return true;
  } catch {
    return false;
  }
}

async function checkBoxLocator(locator, timeoutMs) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    await locator.check();
    return true;
  } catch {
    return false;
  }
}

async function radioExistsOnPage(page, action) {
  return page.evaluate(({ name, exact }) => {
    const radio = findMatchingRadio(name, exact);
    return Boolean(radio);

    function findMatchingRadio(optionName, isExact) {
      const wanted = normalize(optionName);
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

      return radios.find((candidate) => {
        if (candidate.disabled) {
          return false;
        }

        return radioTexts(candidate).some((text) => (
          isExact ? text === wanted : text.includes(wanted)
        ));
      }) || null;
    }

    function radioTexts(radio) {
      const labels = Array.from(document.querySelectorAll('label'))
        .filter((label) => label.htmlFor && label.htmlFor === radio.id)
        .map((label) => label.textContent);

      return [
        radio.getAttribute('aria-label'),
        radio.getAttribute('title'),
        radio.getAttribute('value'),
        radio.id,
        radio.name,
        radio.closest('label')?.textContent,
        radio.parentElement?.textContent,
        radio.closest('td')?.textContent,
        ...labels,
      ].map(normalize).filter(Boolean);
    }

    function normalize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    name: action.name,
    exact: action.exact ?? false,
  }).catch(() => false);
}

async function checkboxExistsOnPage(page, action) {
  return page.evaluate(({ name, exact }) => {
    const checkbox = findMatchingCheckbox(name, exact);
    return Boolean(checkbox);

    function findMatchingCheckbox(optionName, isExact) {
      const wanted = normalize(optionName);
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));

      return checkboxes.find((candidate) => {
        if (candidate.disabled) {
          return false;
        }

        return checkboxTexts(candidate).some((text) => (
          isExact ? text === wanted : text.includes(wanted)
        ));
      }) || null;
    }

    function checkboxTexts(checkbox) {
      const labels = Array.from(document.querySelectorAll('label'))
        .filter((label) => label.htmlFor && label.htmlFor === checkbox.id)
        .map((label) => label.textContent);

      return [
        checkbox.getAttribute('aria-label'),
        checkbox.getAttribute('title'),
        checkbox.getAttribute('value'),
        checkbox.id,
        checkbox.name,
        checkbox.closest('label')?.textContent,
        checkbox.parentElement?.textContent,
        checkbox.closest('td')?.textContent,
        ...labels,
      ].map(normalize).filter(Boolean);
    }

    function normalize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    name: action.name,
    exact: action.exact ?? false,
  }).catch(() => false);
}

async function checkRadioByDomText(page, action) {
  return page.evaluate(({ name, exact }) => {
    const radio = findMatchingRadio(name, exact);

    if (!radio) {
      return false;
    }

    radio.scrollIntoView({ block: 'center', inline: 'nearest' });
    radio.click();
    radio.checked = true;
    radio.dispatchEvent(new Event('input', { bubbles: true }));
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    return true;

    function findMatchingRadio(optionName, isExact) {
      const wanted = normalize(optionName);
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

      return radios.find((candidate) => {
        if (candidate.disabled) {
          return false;
        }

        return radioTexts(candidate).some((text) => (
          isExact ? text === wanted : text.includes(wanted)
        ));
      }) || null;
    }

    function radioTexts(radio) {
      const labels = Array.from(document.querySelectorAll('label'))
        .filter((label) => label.htmlFor && label.htmlFor === radio.id)
        .map((label) => label.textContent);

      return [
        radio.getAttribute('aria-label'),
        radio.getAttribute('title'),
        radio.getAttribute('value'),
        radio.id,
        radio.name,
        radio.closest('label')?.textContent,
        radio.parentElement?.textContent,
        radio.closest('td')?.textContent,
        ...labels,
      ].map(normalize).filter(Boolean);
    }

    function normalize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    name: action.name,
    exact: action.exact ?? false,
  }).catch(() => false);
}

async function checkBoxByDomText(page, action) {
  return page.evaluate(({ name, exact }) => {
    const checkbox = findMatchingCheckbox(name, exact);

    if (!checkbox) {
      return false;
    }

    checkbox.scrollIntoView({ block: 'center', inline: 'nearest' });
    checkbox.click();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    return true;

    function findMatchingCheckbox(optionName, isExact) {
      const wanted = normalize(optionName);
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));

      return checkboxes.find((candidate) => {
        if (candidate.disabled) {
          return false;
        }

        return checkboxTexts(candidate).some((text) => (
          isExact ? text === wanted : text.includes(wanted)
        ));
      }) || null;
    }

    function checkboxTexts(checkbox) {
      const labels = Array.from(document.querySelectorAll('label'))
        .filter((label) => label.htmlFor && label.htmlFor === checkbox.id)
        .map((label) => label.textContent);

      return [
        checkbox.getAttribute('aria-label'),
        checkbox.getAttribute('title'),
        checkbox.getAttribute('value'),
        checkbox.id,
        checkbox.name,
        checkbox.closest('label')?.textContent,
        checkbox.parentElement?.textContent,
        checkbox.closest('td')?.textContent,
        ...labels,
      ].map(normalize).filter(Boolean);
    }

    function normalize(text) {
      return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    name: action.name,
    exact: action.exact ?? false,
  }).catch(() => false);
}

function resolveValue(value, context) {
  if (value === '$ENTITY_NAME') {
    return context.entityName || '';
  }

  if (value === '$LAST_NAME') {
    return context.lastName || '';
  }

  if (value === '$FIRST_NAME') {
    return context.firstName || '';
  }

  if (value === '$FULL_NAME') {
    return context.fullName || [context.firstName, context.lastName].filter(Boolean).join(' ');
  }

  return value ?? '';
}

async function selectConfiguredOption(locator, action, value, context) {
  const selectedOption = await resolveSelectOption(locator, action, value, context);
  const selectedValue = typeof selectedOption === 'string'
    ? selectedOption
    : selectedOption?.value || '';

  if (action.ifNeeded && selectedValue) {
    const currentValue = await locator.inputValue().catch(() => '');
    if (currentValue === selectedValue) {
      return;
    }
  }

  await locator.selectOption(selectedOption);

  if (action.syncSelectedAttribute && selectedValue) {
    await syncSelectedAttribute(locator, selectedValue, { dispatchEvents: false });
  }

  if (action.waitAfterSelectMs || action.syncSelectedAttribute || action.waitForAspNetPostback) {
    await waitForAspNetPostback(locator.page(), {
      minimumWaitMs: Number(action.waitAfterSelectMs || 500),
    });
  }

  if (action.verifyValue && selectedValue) {
    await verifySelectedValue(locator, selectedValue, action);
  }
}

async function verifySelectedValue(locator, expectedValue, action) {
  const attempts = Number(action.verifyAttempts || 3);
  const delayMs = Number(action.verifyDelayMs || 500);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const currentValue = await locator.inputValue({ timeout: 3_000 }).catch(() => '');

    if (currentValue === expectedValue) {
      return;
    }

    await locator.selectOption(expectedValue).catch(() => {});
    if (action.syncSelectedAttribute) {
      await syncSelectedAttribute(locator, expectedValue, { dispatchEvents: false }).catch(() => {});
    }
    await waitForAspNetPostback(locator.page(), {
      minimumWaitMs: delayMs,
    });
  }

  const selectorHint = action.selector || action.label || 'dropdown';
  throw new Error(`Dropdown "${selectorHint}" did not keep selected value "${expectedValue}" before continuing.`);
}

async function syncSelectedAttribute(locator, selectedValue, { dispatchEvents = true } = {}) {
  await locator.evaluate((select, { value, shouldDispatch }) => {
    for (const option of Array.from(select.options || [])) {
      if (option.value === value) {
        option.selected = true;
        option.setAttribute('selected', 'selected');
      } else {
        option.selected = false;
        option.removeAttribute('selected');
      }
    }

    select.value = value;
    if (shouldDispatch) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { value: selectedValue, shouldDispatch: dispatchEvents });
}

async function waitForAspNetPostback(page, { minimumWaitMs = 500, timeoutMs = 15_000 } = {}) {
  await page.evaluate(({ minimumWaitMs, timeoutMs }) => new Promise((resolve) => {
    const startedAt = Date.now();
    let sawBusy = false;
    let lastActivityAt = startedAt;
    const quietWindowMs = 350;
    const noPostbackGraceMs = Math.max(1_000, minimumWaitMs + 500);
    const observer = new MutationObserver(() => {
      lastActivityAt = Date.now();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const interval = setInterval(() => {
      const manager = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
      const busy = Boolean(manager?.get_isInAsyncPostBack?.());
      const now = Date.now();

      if (busy) {
        sawBusy = true;
        lastActivityAt = now;
      }

      const elapsed = now - startedAt;
      const domIsQuiet = now - lastActivityAt >= quietWindowMs;
      const noPostbackObserved = !sawBusy
        && elapsed >= noPostbackGraceMs
        && domIsQuiet;
      const postbackCompleted = sawBusy
        && !busy
        && elapsed >= minimumWaitMs
        && domIsQuiet;
      const timedOut = elapsed >= timeoutMs;

      if (noPostbackObserved || postbackCompleted || timedOut) {
        clearInterval(interval);
        observer.disconnect();
        resolve();
      }
    }, 50);
  }), { minimumWaitMs: Math.max(0, minimumWaitMs), timeoutMs }).catch(() => {});

  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
}

function isVerifiableValueAction(action) {
  if (action.verifyBeforeSave === false) {
    return false;
  }

  return [
    'textbox',
    'labelNthFill',
    'selectByLabel',
    'labelNthSelect',
    'locatorFill',
    'locatorSetValue',
    'locatorSelect',
  ].includes(action.type);
}

function locatorForValueAction(page, action) {
  if (action.type === 'textbox') {
    return page.getByRole('textbox', {
      name: action.name,
      exact: action.exact ?? false,
    }).first();
  }

  if (action.type === 'labelNthFill' || action.type === 'labelNthSelect') {
    return page.getByLabel(action.label, {
      exact: action.exact ?? false,
    }).nth(action.index || 0);
  }

  if (action.type === 'selectByLabel') {
    return page.getByLabel(action.label, {
      exact: action.exact ?? false,
    }).first();
  }

  return page.locator(action.selector).first();
}

async function expectedValueForAction(locator, action, context) {
  const value = resolveValue(action.value, context);

  if (['selectByLabel', 'labelNthSelect', 'locatorSelect'].includes(action.type)) {
    const selectedOption = await resolveSelectOption(locator, action, value, context);
    if (typeof selectedOption === 'string') {
      return selectedOption;
    }

    if (selectedOption?.value) {
      return selectedOption.value;
    }

    if (selectedOption?.label) {
      return locator.evaluate((select, label) => {
        const option = Array.from(select.options || []).find((candidate) => (
          String(candidate.textContent || '').replace(/\s+/g, ' ').trim() === String(label).trim()
        ));
        return option?.value || '';
      }, selectedOption.label);
    }

    return '';
  }

  return value;
}

function actionDescription(action) {
  return action.selector || action.label || action.name || action.type;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveSelectOption(locator, action, value, context) {
  if (action.optionIncludes) {
    const optionValue = await locator.evaluate((select, optionText) => {
      const normalizedOptionText = String(optionText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const option = Array.from(select.options || []).find((candidate) => (
        String(candidate.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().includes(normalizedOptionText)
      ));

      return option?.value || '';
    }, resolveValue(action.optionIncludes, context));

    if (!optionValue) {
      throw new Error(`Dropdown option containing "${action.optionIncludes}" was not found for "${action.label}".`);
    }

    return optionValue;
  }

  return selectOptionForAction(action, value, context);
}

function selectOptionForAction(action, value, context) {
  if (action.optionLabel) {
    return { label: resolveValue(action.optionLabel, context) };
  }

  if (action.optionValue) {
    return { value: resolveValue(action.optionValue, context) };
  }

  return value;
}
