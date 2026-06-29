import { baselineConfig } from '../config/baseline.config.js';
import { openBusinessEntityMenu, waitForAppIdle } from './navigation.js';
import { logger } from '../utils/logger.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';

export async function openEntityFromModifySearch(page, options) {
  return openEntityFromBusinessEntitySearch(page, {
    ...options,
    actionName: 'Modify',
  });
}

export async function openEntityFromViewSearch(page, options) {
  return openEntityFromBusinessEntitySearch(page, {
    ...options,
    actionName: 'View',
  });
}

export async function openEntityFromBusinessEntitySearch(page, {
  businessUnit,
  entityName,
  entityId,
  searchFallbacks = [],
  actionName = 'Modify',
}) {
  const searchAction = normalizeActionName(actionName);

  if (!entityName && !entityId && !searchFallbacks.length) {
    throw new Error(`Entity name or Entity ID is required for ${searchAction} search. Pass --entity=<name> or configure the BU in config/flow2EntityNames.js / config/flow4EntityNames.js.`);
  }

  await openVerifiedBusinessEntitySearchPage(page, businessUnit, searchAction);
  await selectModifyBusinessUnit(page, businessUnit);
  await ensureModifySearchFieldsReady(page, businessUnit);

  await runModifySearchAttempts(page, {
    businessUnit,
    entityName,
    entityId,
    searchFallbacks,
    actionName: searchAction,
  });
  await waitForAppIdle(page);
  await waitForEntityWorkspace(page, entityName);

  return {
    entityName,
    entityId,
  };
}

async function openVerifiedBusinessEntitySearchPage(page, businessUnit, actionName = 'Modify') {
  const attempts = needsVerifiedBusinessEntitySearchPage(businessUnit, actionName) ? 3 : 1;
  let lastDiagnostics = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await openBusinessEntityMenu(page, actionName, { businessUnit });
    await waitForModifySearchControls(page);

    if (
      !needsVerifiedBusinessEntitySearchPage(businessUnit, actionName)
      || await isExpectedBusinessEntitySearchPage(page, businessUnit)
    ) {
      return;
    }

    lastDiagnostics = await modifySearchPageDiagnostics(page);
    logger.info(`${actionName} search page did not match ${businessUnit.id} on attempt ${attempt}; retrying from Home. ${lastDiagnostics}`);
    await returnToHome(page);
  }

  throw new Error(`Could not open the expected ${actionName} search page for ${businessUnit.id}. ${lastDiagnostics}`);
}

function needsVerifiedBusinessEntitySearchPage(businessUnit, actionName = 'Modify') {
  const lowerActionName = String(actionName).toLowerCase();

  return Boolean(
    businessUnit.businessEntityActionIndexes?.[actionName]
    || businessUnit.businessEntityActionIndexes?.[lowerActionName]
    || businessUnit.businessEntityActionCandidateIndexes?.[actionName]
    || businessUnit.businessEntityActionCandidateIndexes?.[lowerActionName]
  );
}

async function isExpectedBusinessEntitySearchPage(page, businessUnit) {
  return await modifySearchPageHasBusinessUnitOption(page, businessUnit)
    && await hasAnyModifySearchField(page, businessUnit);
}

async function modifySearchPageHasBusinessUnitOption(page, businessUnit) {
  const optionTexts = uniqueValues([
    businessUnit.modifyBusinessUnitOption,
    businessUnit.name,
  ]);

  return page.evaluate(({ optionTexts, selectors }) => {
    const wanted = optionTexts.map(clean).filter(Boolean);
    const selects = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));

    return selects.some((select) => Array.from(select.options || []).some((option) => {
      const text = clean(option.textContent);
      return wanted.some((wantedText) => (
        text === wantedText
        || (wantedText.length > 3 && text.includes(wantedText))
        || (text.length > 3 && wantedText.includes(text))
      ));
    }));

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    optionTexts,
    selectors: modifyBusinessUnitSelectSelectors(),
  }).catch(() => false);
}

async function modifySearchPageDiagnostics(page) {
  return page.evaluate((selectors) => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const selects = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const businessUnitOptions = selects.flatMap((select) => Array.from(select.options || []).map((option) => clean(option.textContent || option.value))).filter(Boolean);
    const visibleInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'))
      .filter((input) => input.offsetParent !== null)
      .map((input) => clean(input.id || input.name || input.getAttribute('aria-label') || input.getAttribute('title')))
      .filter(Boolean)
      .slice(0, 8);

    return `Current BU options=[${businessUnitOptions.join(', ')}], visible inputs=[${visibleInputs.join(', ')}].`;
  }, modifyBusinessUnitSelectSelectors()).catch(() => '');
}

async function returnToHome(page) {
  if (await clickIfUsable(page.getByRole('link', { name: 'Home', exact: true }).first())) {
    await waitForAppIdle(page);
    return;
  }

  await page.goBack({
    waitUntil: 'domcontentloaded',
    timeout: baselineConfig.timeouts.navigationMs,
  }).catch(() => {});
  await waitForAppIdle(page);
}

async function selectModifyBusinessUnit(page, businessUnit) {
  const optionName = businessUnit.modifyBusinessUnitOption;
  const optionTexts = await resolveModifyBusinessUnitOptionTexts(page, businessUnit, optionName);
  const nativeSelectCandidates = [
    page.locator('select#ddlProgramInternal').first(),
    page.locator('select[id*="ddlProgramInternal"]').first(),
    page.locator('select[name*="ddlProgramInternal"]').first(),
    page.getByLabel('Business Unit').first(),
  ];

  if (await selectModifyBusinessUnitWithSelect2(page, optionTexts)) {
    await waitForAppIdle(page);
    return;
  }

  if (await selectModifyBusinessUnitByDom(page, optionTexts)) {
    await waitForAppIdle(page);
    return;
  }

  for (const select of nativeSelectCandidates) {
    if (await selectOptionIfUsable(select, optionTexts)) {
      await waitForAppIdle(page);
      return;
    }
  }

  throw new Error(`Could not select Modify Business Unit "${optionName}". Tried Select2 search/results and native select options.`);
}

async function resolveModifyBusinessUnitOptionTexts(page, businessUnit, optionName) {
  const configuredTexts = uniqueValues([
    optionName,
    businessUnit.name,
    businessUnit.createBusinessUnitValue,
  ]);

  const pageOptionTexts = await page.evaluate(({ selectors, configuredTexts }) => {
    const wanted = configuredTexts.map(clean).filter(Boolean);
    const selects = uniqueElements(
      selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
    );
    const matches = [];

    for (const select of selects) {
      const options = Array.from(select.options || []);
      for (const option of options) {
        const text = clean(option.textContent);
        const value = clean(option.value);
        if (!text && !value) {
          continue;
        }

        const isMatch = wanted.some((item) => (
          item === text
          || item === value
          || (item.length > 3 && text.includes(item))
          || (text.length > 3 && item.includes(text))
        ));

        if (isMatch) {
          matches.push(option.textContent || option.value);
        }
      }
    }

    return matches;

    function uniqueElements(elements) {
      return [...new Set(elements.filter(Boolean))];
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    selectors: modifyBusinessUnitSelectSelectors(),
    configuredTexts,
  }).catch(() => []);

  return uniqueValues([
    ...pageOptionTexts,
    optionName,
    businessUnit.name,
  ]);
}

async function selectModifyBusinessUnitWithSelect2(page, optionTexts) {
  for (const optionText of optionTexts) {
    if (!await openModifyBusinessUnitSelect2(page)) {
      continue;
    }

    if (await searchSelect2Option(page, optionText) && await clickSelect2BusinessUnitOption(page, optionText)) {
      await waitForAppIdle(page);
      if (await selectedModifyBusinessUnitMatches(page, optionTexts)) {
        return true;
      }

      return true;
    }

    await closeSelect2(page);
  }

  return false;
}

async function openModifyBusinessUnitSelect2(page) {
  const select2Triggers = [
    page.locator('#select2-ddlProgramInternal-container').first(),
    page.locator('#select2-ddlProgramInternal-container').locator('xpath=ancestor::*[contains(@class, "select2-selection")][1]').first(),
    page.locator('.select2-selection[aria-labelledby="select2-ddlProgramInternal-container"]').first(),
    page.locator('select#ddlProgramInternal + .select2 .select2-selection').first(),
    page.locator('select[id*="ddlProgramInternal"] + .select2 .select2-selection').first(),
    page.locator('select[name*="ddlProgramInternal"] + .select2 .select2-selection').first(),
    page.locator('#ddlProgramInternal').locator('xpath=following-sibling::*[contains(@class, "select2")]').first(),
    page.locator('span.select2-container').filter({ has: page.locator('#select2-ddlProgramInternal-container') }).locator('.select2-selection').first(),
  ];

  for (const trigger of select2Triggers) {
    if (await clickIfUsable(trigger)) {
      if (await waitForOpenSelect2(page)) {
        return true;
      }
    }
  }

  const openedByDom = await page.evaluate((selectors) => {
    const select = selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const triggerCandidates = [
      document.querySelector('#select2-ddlProgramInternal-container'),
      document.querySelector('.select2-selection[aria-labelledby="select2-ddlProgramInternal-container"]'),
      select?.nextElementSibling?.classList?.contains('select2') ? select.nextElementSibling : null,
      select?.parentElement?.querySelector('.select2-selection'),
    ].filter(Boolean);

    for (const trigger of triggerCandidates) {
      const clickable = trigger.closest?.('.select2-selection') || trigger.closest?.('.select2-container') || trigger;
      clickable.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      clickable.click?.();

      if (document.querySelector('.select2-container--open')) {
        return true;
      }
    }

    const jquery = window.jQuery || window.$;
    if (select && jquery?.fn?.select2) {
      jquery(select).select2('open');
      return Boolean(document.querySelector('.select2-container--open'));
    }

    return false;
  }, modifyBusinessUnitSelectSelectors()).catch(() => false);

  if (openedByDom && await waitForOpenSelect2(page)) {
    return true;
  }

  return false;
}

async function waitForOpenSelect2(page) {
  return page.locator('.select2-container--open').first().waitFor({
    state: 'visible',
    timeout: 2_000,
  }).then(() => true).catch(() => false);
}

async function searchSelect2Option(page, optionText) {
  const searchField = page.locator('.select2-container--open .select2-search__field').last();

  try {
    if ((await searchField.count()) > 0 && await searchField.isVisible()) {
      await searchField.fill(optionText, {
        timeout: baselineConfig.timeouts.actionMs,
      });
      await waitForPageTimeout(page, 300, 'Select2 result filtering');
    }

    await page.locator('.select2-container--open .select2-results__option').first().waitFor({
      state: 'visible',
      timeout: baselineConfig.timeouts.actionMs,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function clickSelect2BusinessUnitOption(page, optionText) {
  const exactTextPattern = new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`);
  const candidates = [
    page.locator('.select2-container--open .select2-results__option').filter({ hasText: exactTextPattern }).first(),
    page.locator('.select2-container--open [role="option"]').filter({ hasText: exactTextPattern }).first(),
    page.locator('.select2-container--open .select2-results__option').filter({ hasText: optionText }).first(),
    page.locator('.select2-container--open [role="option"]').filter({ hasText: optionText }).first(),
  ];

  for (const candidate of candidates) {
    if (await clickIfUsable(candidate)) {
      return true;
    }
  }

  return page.evaluate((wantedText) => {
    const wanted = clean(wantedText);
    const options = Array.from(document.querySelectorAll('.select2-container--open .select2-results__option, .select2-container--open [role="option"]'))
      .filter((option) => !option.getAttribute('aria-disabled') && !option.classList.contains('select2-results__message'));
    const option = options.find((item) => clean(item.textContent) === wanted)
      || options.find((item) => clean(item.textContent).includes(wanted));

    if (!option) {
      return false;
    }

    option.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    option.click?.();
    return true;

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, optionText).catch(() => false);
}

async function closeSelect2(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await waitForPageTimeout(page, 150, 'closing Select2 dropdown');
}

async function selectedModifyBusinessUnitMatches(page, optionTexts) {
  const selectedTexts = await page.evaluate((selectors) => {
    const texts = [];
    const select = selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);

    if (select?.selectedOptions?.length) {
      texts.push(...Array.from(select.selectedOptions).map((option) => option.textContent || option.value));
    }

    const select2Text = document.querySelector('#select2-ddlProgramInternal-container')?.textContent;
    if (select2Text) {
      texts.push(select2Text);
    }

    return texts;
  }, modifyBusinessUnitSelectSelectors()).catch(() => []);

  if (!selectedTexts.length) {
    return false;
  }

  return selectedTexts.some((selectedText) => optionTexts.some((optionText) => textMatches(selectedText, optionText)));
}

async function selectModifyBusinessUnitByDom(page, optionTexts) {
  const result = await page.evaluate(({ optionTexts, selectors }) => {
    return selectByNearbyLabel({
      labelTexts: ['Business Unit', 'Program'],
      optionTexts,
      selectors,
    });

    function selectByNearbyLabel({ labelTexts, optionTexts, selectors }) {
      const wantedOptions = optionTexts.map(clean).filter(Boolean);
      const wantedLabels = labelTexts.map(clean).filter(Boolean);
      const knownSelects = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
      const ranked = uniqueElements([
        ...knownSelects,
        ...Array.from(document.querySelectorAll('select')),
      ])
        .map((select, index) => ({
          select,
          score: scoreSelect(select, index),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score);

      for (const candidate of ranked) {
        const option = findOption(candidate.select, wantedOptions);
        if (option) {
          setSelectValue(candidate.select, option);
          return {
            selected: true,
            text: option.textContent || '',
            value: option.value || '',
            id: candidate.select.id || '',
            name: candidate.select.name || '',
          };
        }
      }

      return {
        selected: false,
        diagnostics: ranked.slice(0, 5).map((candidate) => ({
          id: candidate.select.id || '',
          name: candidate.select.name || '',
          score: candidate.score,
          label: nearbyLabelText(candidate.select),
          selected: candidate.select.selectedOptions?.[0]?.textContent || '',
          options: Array.from(candidate.select.options || []).slice(0, 8).map((option) => option.textContent || option.value || ''),
        })),
      };

      function scoreSelect(select, index) {
        let score = 0;
        const attrs = clean([
          select.id,
          select.name,
          select.getAttribute('aria-label'),
          select.getAttribute('title'),
          Array.from(select.labels || []).map((label) => label.textContent).join(' '),
        ].join(' '));
        const nearbyLabel = clean(nearbyLabelText(select));
        const optionsText = clean(Array.from(select.options || []).map((option) => `${option.textContent} ${option.value}`).join(' '));

        if (wantedLabels.some((label) => attrs.includes(label))) score += 50;
        if (wantedLabels.some((label) => nearbyLabel.includes(label))) score += 45;
        if (/ddlprograminternal|businessunit|business_unit|programinternal/.test(attrs)) score += 40;
        if (score > 0 && wantedOptions.some((item) => item && optionsText.includes(item))) score += 20;
        if (score > 0 && select.offsetParent !== null) score += 5;

        return score - (index * 0.01);
      }
    }

    function findOption(select, wantedOptions) {
      const options = Array.from(select.options || []).filter((option) => !option.disabled);

      return options.find((option) => {
        const text = clean(option.textContent);
        const value = clean(option.value);
        return wantedOptions.some((wanted) => wanted === text || wanted === value);
      }) || options.find((option) => {
        const text = clean(option.textContent);
        return wantedOptions.some((wanted) => (
          wanted.length > 3
          && text.length > 3
          && (text.includes(wanted) || wanted.includes(text))
        ));
      });
    }

    function setSelectValue(select, option) {
      select.value = option.value;
      option.selected = true;

      const jquery = window.jQuery || window.$;
      if (jquery) {
        jquery(select).val(option.value).trigger('change');
      }

      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function nearbyLabelText(select) {
      const parts = [];
      const labels = Array.from(select.labels || []).map((label) => label.textContent || '');
      parts.push(...labels);

      const cell = select.closest('td, th, .form-group, .row, div');
      if (cell?.previousElementSibling) {
        parts.push(cell.previousElementSibling.textContent || '');
      }

      const row = select.closest('tr');
      if (row) {
        const cells = Array.from(row.children);
        const cellIndex = cells.findIndex((item) => item.contains(select));
        if (cellIndex > 0) {
          parts.push(cells[cellIndex - 1].textContent || '');
        }
      }

      const parent = select.parentElement;
      if (parent) {
        const siblings = Array.from(parent.childNodes);
        const index = siblings.indexOf(select);
        parts.push(...siblings.slice(Math.max(0, index - 3), index).map((node) => node.textContent || ''));
      }

      return parts.join(' ');
    }

    function uniqueElements(elements) {
      return [...new Set(elements.filter(Boolean))];
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, {
    optionTexts,
    selectors: modifyBusinessUnitSelectSelectors(),
  }).catch(() => ({ selected: false }));

  if (result?.selected) {
    logger.info(`Selected Modify Business Unit via page dropdown: ${result.text || result.value}`);
    return true;
  }

  if (result?.diagnostics?.length) {
    logger.info(`Modify Business Unit dropdown diagnostics: ${JSON.stringify(result.diagnostics)}`);
  }

  return false;
}

async function selectOptionIfUsable(locator, optionTexts) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    for (const optionText of optionTexts) {
      if (await tryNativeSelectOption(locator, optionText)) {
        return true;
      }
    }

    return locator.evaluate((select, wantedTexts) => {
      const wanted = wantedTexts.map(clean).filter(Boolean);
      const option = Array.from(select.options || []).find((item) => {
        const text = clean(item.textContent);
        const value = clean(item.value);
        return wanted.some((wantedText) => wantedText === text || wantedText === value);
      });

      if (!option) {
        return false;
      }

      select.value = option.value;
      option.selected = true;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;

      function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      }
    }, optionTexts);
  } catch {
    return false;
  }
}

async function tryNativeSelectOption(locator, optionText) {
  try {
    await locator.selectOption({ label: optionText }, {
      timeout: baselineConfig.timeouts.actionMs,
    });
    return true;
  } catch {}

  try {
    await locator.selectOption({ value: optionText }, {
      timeout: baselineConfig.timeouts.actionMs,
    });
    return true;
  } catch {
    return false;
  }
}

function modifyBusinessUnitSelectSelectors() {
  return [
    'select#ddlProgramInternal',
    'select[id*="ddlProgramInternal"]',
    'select[name*="ddlProgramInternal"]',
  ];
}

async function waitForModifySearchControls(page) {
  const controls = [
    page.locator('select#ddlProgramInternal').first(),
    page.locator('select[id*="ddlProgramInternal"]').first(),
    page.locator('#select2-ddlProgramInternal-container').first(),
    page.getByText('Entity Search', { exact: false }).first(),
    page.getByRole('button', { name: 'Search', exact: true }).first(),
  ];

  const deadline = Date.now() + baselineConfig.timeouts.searchResultsMs;
  while (Date.now() <= deadline) {
    for (const control of controls) {
      if (await isLocatorVisibleSafe(control)) {
        return;
      }
    }

    await waitForPageTimeout(page, 500, 'waiting for Modify search controls');
  }
}

async function fillModifyEntityName(page, businessUnit, entityName) {
  const fieldNames = businessUnit.modifyEntitySearchFieldNames?.length
    ? businessUnit.modifyEntitySearchFieldNames
    : ['Entity Name'];
  const deadline = Date.now() + baselineConfig.timeouts.searchResultsMs;

  await ensureModifySearchFieldsReady(page, businessUnit);

  while (Date.now() <= deadline) {
    for (const fieldName of fieldNames) {
      const exactTextbox = page.getByRole('textbox', { name: fieldName, exact: true }).first();
      if (await fillIfUsable(exactTextbox, entityName)) {
        return;
      }

      const looseTextbox = page.getByRole('textbox', { name: fieldName }).first();
      if (await fillIfUsable(looseTextbox, entityName)) {
        return;
      }

      if (await fillInputNearLabel(page, fieldName, entityName)) {
        return;
      }
    }

    await waitForPageTimeout(page, 500, 'waiting for Modify entity name field');
  }

  throw new Error(`Could not find Modify search Entity Name field. Tried: ${fieldNames.join(', ')}`);
}

async function ensureModifySearchFieldsReady(page, businessUnit) {
  const configuredEntityTypeOptions = uniqueValues([
    businessUnit.modifyEntityTypeOption,
    ...(businessUnit.modifyEntityTypeOptions || []),
  ]);
  const entityTypeOptions = configuredEntityTypeOptions.length
    ? configuredEntityTypeOptions
    : uniqueValues([
    'Agency',
    'Entity',
    'Facility',
  ]);

  if (configuredEntityTypeOptions.length) {
    const alreadySelected = await selectedModifyEntityTypeMatches(page, configuredEntityTypeOptions);
    if (!alreadySelected && !await selectModifyEntityTypeByDom(page, entityTypeOptions)) {
      throw new Error(
        `Could not select Modify Entity Type "${configuredEntityTypeOptions.join(' / ')}" for ${businessUnit.id}.`,
      );
    }

    await waitForAppIdle(page);

    if (!await selectedModifyEntityTypeMatches(page, configuredEntityTypeOptions)) {
      throw new Error(
        `Modify Entity Type did not remain selected as "${configuredEntityTypeOptions.join(' / ')}" for ${businessUnit.id}.`,
      );
    }
  } else if (!await hasAnyModifySearchField(page, businessUnit)) {
    if (await selectModifyEntityTypeByDom(page, entityTypeOptions)) {
      await waitForAppIdle(page);
    }
  }

  const deadline = Date.now() + baselineConfig.timeouts.searchResultsMs;
  while (Date.now() <= deadline) {
    if (await hasAnyModifySearchField(page, businessUnit)) {
      return;
    }

    await waitForPageTimeout(page, 250, 'waiting for Modify search fields after Entity Type selection');
  }

  throw new Error(
    `Modify search fields did not become available for ${businessUnit.id} after selecting Entity Type "${entityTypeOptions.join(' / ')}".`,
  );
}

async function hasAnyModifySearchField(page, businessUnit) {
  const fieldNames = uniqueValues([
    ...(businessUnit.modifyEntitySearchFieldNames || []),
    'Entity Name',
    'Facility Name',
  ]);

  for (const fieldName of fieldNames) {
    if (await isLocatorVisibleSafe(page.getByRole('textbox', { name: fieldName, exact: true }).first())) {
      return true;
    }

    if (await isLocatorVisibleSafe(page.getByRole('textbox', { name: fieldName }).first())) {
      return true;
    }

    if (await inputNearLabelExists(page, fieldName)) {
      return true;
    }
  }

  return false;
}

async function selectModifyEntityTypeByDom(page, optionTexts) {
  const result = await page.evaluate(({ optionTexts }) => {
    const wantedOptions = optionTexts.map(clean).filter(Boolean);
    const labelTexts = ['Entity Type'].map(clean);
    const ranked = Array.from(document.querySelectorAll('select'))
      .map((select, index) => ({
        select,
        score: scoreSelect(select, index),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    for (const candidate of ranked) {
      const option = findOption(candidate.select);
      if (!option) {
        continue;
      }

      setSelectValue(candidate.select, option);
      return {
        selected: true,
        text: option.textContent || '',
        value: option.value || '',
      };
    }

    return { selected: false };

    function scoreSelect(select, index) {
      const attrs = clean([
        select.id,
        select.name,
        select.getAttribute('aria-label'),
        select.getAttribute('title'),
        Array.from(select.labels || []).map((label) => label.textContent).join(' '),
      ].join(' '));
      const nearbyLabel = clean(nearbyLabelText(select));
      const optionsText = clean(Array.from(select.options || []).map((option) => `${option.textContent} ${option.value}`).join(' '));
      let score = 0;

      if (labelTexts.some((label) => attrs.includes(label))) score += 50;
      if (labelTexts.some((label) => nearbyLabel.includes(label))) score += 45;
      if (/entitytype|entity_type/.test(attrs)) score += 40;
      if (score > 0 && wantedOptions.some((item) => optionsText.includes(item))) score += 10;
      if (score > 0 && select.offsetParent !== null) score += 5;

      return score - (index * 0.01);
    }

    function findOption(select) {
      const options = Array.from(select.options || []).filter((option) => !option.disabled);

      return options.find((option) => {
        const text = clean(option.textContent);
        const value = clean(option.value);
        return wantedOptions.some((wanted) => wanted === text || wanted === value);
      }) || options.find((option) => {
        const text = clean(option.textContent);
        return wantedOptions.some((wanted) => (
          wanted.length > 3
          && text.length > 3
          && (text.includes(wanted) || wanted.includes(text))
        ));
      });
    }

    function setSelectValue(select, option) {
      select.value = option.value;
      option.selected = true;

      const jquery = window.jQuery || window.$;
      if (jquery) {
        jquery(select).val(option.value).trigger('change');
      }

      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function nearbyLabelText(select) {
      const parts = [];
      parts.push(...Array.from(select.labels || []).map((label) => label.textContent || ''));

      const cell = select.closest('td, th, .form-group, .row, div');
      if (cell?.previousElementSibling) {
        parts.push(cell.previousElementSibling.textContent || '');
      }

      const row = select.closest('tr');
      if (row) {
        const cells = Array.from(row.children);
        const cellIndex = cells.findIndex((item) => item.contains(select));
        if (cellIndex > 0) {
          parts.push(cells[cellIndex - 1].textContent || '');
        }
      }

      return parts.join(' ');
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, { optionTexts }).catch(() => ({ selected: false }));

  if (result?.selected) {
    logger.info(`Selected Modify Entity Type via page dropdown: ${result.text || result.value}`);
    return true;
  }

  return false;
}

async function selectedModifyEntityTypeMatches(page, optionTexts) {
  return page.evaluate(({ optionTexts }) => {
    const wantedOptions = optionTexts.map(clean).filter(Boolean);
    const selects = Array.from(document.querySelectorAll('select'));

    return selects.some((select) => {
      const attrs = clean([
        select.id,
        select.name,
        select.getAttribute('aria-label'),
        select.getAttribute('title'),
        Array.from(select.labels || []).map((label) => label.textContent).join(' '),
        nearbyLabelText(select),
      ].join(' '));

      if (!attrs.includes('entity type') && !/entitytype|entity_type/.test(attrs)) {
        return false;
      }

      const selectedOption = select.options?.[select.selectedIndex];
      const selectedText = clean(selectedOption?.textContent);
      const selectedValue = clean(selectedOption?.value || select.value);

      return wantedOptions.some((wanted) => (
        wanted === selectedText
        || wanted === selectedValue
        || (
          wanted.length > 3
          && selectedText.length > 3
          && (selectedText.includes(wanted) || wanted.includes(selectedText))
        )
      ));
    });

    function nearbyLabelText(select) {
      const parts = [];
      const cell = select.closest('td, th, .form-group, .row, div');
      const row = select.closest('tr');

      if (cell?.previousElementSibling) {
        parts.push(cell.previousElementSibling.textContent || '');
      }

      if (row) {
        const cells = Array.from(row.children);
        const cellIndex = cells.findIndex((item) => item.contains(select));
        if (cellIndex > 0) {
          parts.push(cells[cellIndex - 1].textContent || '');
        }
      }

      return parts.join(' ');
    }

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }, { optionTexts }).catch(() => false);
}

async function fillModifyEntityId(page, entityId) {
  const fieldNames = ['Entity ID', 'Entity Id'];
  const deadline = Date.now() + baselineConfig.timeouts.searchResultsMs;

  while (Date.now() <= deadline) {
    for (const fieldName of fieldNames) {
      const exactTextbox = page.getByRole('textbox', { name: fieldName, exact: true }).first();
      if (await fillIfUsable(exactTextbox, entityId)) {
        return;
      }

      const looseTextbox = page.getByRole('textbox', { name: fieldName }).first();
      if (await fillIfUsable(looseTextbox, entityId)) {
        return;
      }
    }

    await waitForPageTimeout(page, 500, 'waiting for Modify entity ID field');
  }

  throw new Error('Could not find Modify search Entity ID field.');
}

async function runModifySearchAttempts(page, {
  businessUnit,
  entityName,
  entityId,
  searchFallbacks = [],
  actionName = 'Modify',
}) {
  const attempts = buildSearchAttempts({
    businessUnit,
    entityName,
    entityId,
    searchFallbacks,
  });
  const retryDelayMs = Number(businessUnit.modifySearchRetryDelayMs || 5_000);
  let lastSearchSummary = '';

  for (const attempt of attempts) {
    for (let retry = 1; retry <= attempt.retries; retry += 1) {
      await clearModifySearchFields(page, businessUnit, searchFallbacks);

      if (attempt.type === 'entityId') {
        await fillModifyEntityId(page, attempt.value);
      } else if (attempt.type === 'field') {
        await fillModifySearchField(page, attempt.fieldNames, attempt.value);
      } else {
        await fillModifyEntityName(page, businessUnit, attempt.value);
      }

      await page.getByRole('button', { name: 'Search' }).click();
      if (await waitForWorkspaceOrSearchResults(page, entityName || attempt.value, { actionName })) {
        return;
      }

      if (await waitForDirectWorkspaceAfterSearch(page, entityName || attempt.value, { actionName, timeout: 1_500 })) {
        return;
      }

      if (await clickEntityResult(page, entityName || attempt.value, {
        allowFirstResult: attempt.type === 'entityId' || attempt.type === 'field',
      })) {
        return;
      }

      lastSearchSummary = `${attempt.label}${retry > 1 ? ` retry ${retry}` : ''}`;

      if (retry < attempt.retries) {
        logger.info(`No ${actionName} result for ${lastSearchSummary}; retrying after ${retryDelayMs / 1000}s.`);
        await waitForPageTimeout(page, retryDelayMs, `${actionName} search retry delay`);
      }
    }
  }

  throw new Error(
    `Could not find a clickable ${actionName} search result for entity "${entityName || entityId}". Tried: ${attempts.map((attempt) => attempt.label).join(', ')}.`,
  );
}

async function waitForWorkspaceOrSearchResults(page, entityName, { actionName = 'Modify' } = {}) {
  await waitForAppIdle(page);

  const outcome = await Promise.race([
    isEntityWorkspaceReady(page, {
      timeout: baselineConfig.timeouts.searchResultsMs,
    }).then((ready) => (ready ? 'workspace' : 'none')),
    waitForSearchResults(page).then((ready) => (ready ? 'results' : 'none')),
  ]);

  if (outcome === 'workspace') {
    logger.info(`${actionName} search opened the entity workspace directly for "${entityName}".`);
    await waitForAppIdle(page);
    return true;
  }

  return false;
}

async function waitForDirectWorkspaceAfterSearch(page, entityName, { actionName = 'Modify', timeout = 8_000 } = {}) {
  await waitForAppIdle(page);

  const workspaceReady = await isEntityWorkspaceReady(page, {
    timeout: Math.min(timeout, baselineConfig.timeouts.navigationMs),
  });

  if (!workspaceReady) {
    return false;
  }

  logger.info(`${actionName} search opened the entity workspace directly for "${entityName}".`);
  await waitForAppIdle(page);
  return true;
}

async function isEntityWorkspaceReady(page, { timeout = 8_000 } = {}) {
  return waitForWorkspaceSignal(page, timeout);
}

function buildSearchAttempts({
  businessUnit,
  entityName,
  entityId,
  searchFallbacks = [],
}) {
  const attempts = [];
  const nameRetries = Number(businessUnit.modifySearchNameRetries || 5);
  const initialNameRetries = Math.max(1, Number(businessUnit.modifySearchInitialNameRetries || 1));
  const fallbackRetries = Number(businessUnit.modifySearchFallbackRetries || 2);
  const nameVariants = uniqueValues(entityNameSearchVariants(entityName));
  const useEarlyEntityId = Boolean(entityId && nameVariants.length);

  if (useEarlyEntityId) {
    attempts.push(buildNameSearchAttempt(nameVariants[0], initialNameRetries));
  }

  if (entityId) {
    attempts.push({
      type: 'entityId',
      value: entityId,
      label: `Entity ID "${entityId}"`,
      retries: 2,
    });
  }

  for (const [index, value] of nameVariants.entries()) {
    if (useEarlyEntityId && index === 0) {
      const remainingNameRetries = Math.max(0, nameRetries - initialNameRetries);
      if (remainingNameRetries > 0) {
        attempts.push(buildNameSearchAttempt(value, remainingNameRetries));
      }
      continue;
    }

    attempts.push(buildNameSearchAttempt(value, attempts.length === 0 ? nameRetries : 1));
  }

  for (const fallback of searchFallbacks) {
    const value = resolveSearchFallbackValue(fallback?.value, {
      entityName,
      entityId,
    });
    const fieldNames = uniqueValues(fallback?.fieldNames || [fallback?.fieldName || fallback?.label]);

    if (!value || !fieldNames.length) {
      continue;
    }

    attempts.push({
      type: 'field',
      value,
      fieldNames,
      label: `${fallback.label || fieldNames.join('/')} "${value}"`,
      retries: fallback.retries || fallbackRetries,
    });
  }

  return attempts;
}

function resolveSearchFallbackValue(value, { entityName, entityId }) {
  return String(value || '')
    .replace(/\$ENTITY_NAME\b/g, String(entityName || ''))
    .replace(/\$ENTITY_ID\b/g, String(entityId || ''))
    .trim();
}

function buildNameSearchAttempt(value, retries) {
  return {
    type: 'name',
    value,
    label: `Entity Name "${value}"`,
    retries,
  };
}

function entityNameSearchVariants(entityName) {
  if (!entityName) {
    return [];
  }

  return [
    entityName,
    entityName.replace(/_0([1-9]:\d{2}:\d{2}\s[AP]M)$/i, '_$1'),
    entityName.replace(/_([1-9]:\d{2}:\d{2}\s[AP]M)$/i, '_0$1'),
  ];
}

function normalizeActionName(actionName) {
  const normalized = String(actionName || '').replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalized === 'view') return 'View';
  if (normalized === 'modify') return 'Modify';
  if (normalized === 'new') return 'New';

  return normalized
    ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Modify';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMatches(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return (
    normalizedLeft === normalizedRight
    || (normalizedRight.length > 3 && normalizedLeft.includes(normalizedRight))
    || (normalizedLeft.length > 3 && normalizedRight.includes(normalizedLeft))
  );
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function clearModifySearchFields(page, businessUnit, searchFallbacks = []) {
  const fieldNames = uniqueValues([
    ...(businessUnit.modifyEntitySearchFieldNames || []),
    ...searchFallbacks.flatMap((fallback) => fallback?.fieldNames || [fallback?.fieldName || fallback?.label]),
    'Entity Name',
    'Facility Name',
    'Entity ID',
    'Entity Id',
    'Serial No',
    'Serial No.',
    'Local License #',
    'NV Business ID',
  ]);

  for (const fieldName of fieldNames) {
    await fillIfUsable(page.getByRole('textbox', { name: fieldName, exact: true }).first(), '');
    await fillIfUsable(page.getByRole('textbox', { name: fieldName }).first(), '');
  }
}

async function fillModifySearchField(page, fieldNames, value) {
  const deadline = Date.now() + baselineConfig.timeouts.searchResultsMs;

  while (Date.now() <= deadline) {
    for (const fieldName of fieldNames) {
      const exactTextbox = page.getByRole('textbox', { name: fieldName, exact: true }).first();
      if (await fillIfUsable(exactTextbox, value)) {
        return;
      }

      const looseTextbox = page.getByRole('textbox', { name: fieldName }).first();
      if (await fillIfUsable(looseTextbox, value)) {
        return;
      }
    }

    await waitForPageTimeout(page, 500, 'waiting for Modify fallback search field');
  }

  throw new Error(`Could not find Modify search field. Tried: ${fieldNames.join(', ')}`);
}

async function waitForSearchResults(page) {
  const timeout = baselineConfig.timeouts.searchResultsMs;
  const waits = [
    page.getByRole('heading', { name: 'Search Results' }).waitFor({
      state: 'visible',
      timeout,
    }),
    page.locator('table').first().waitFor({
      state: 'visible',
      timeout,
    }),
    page.getByText(/No matching record\(s\) found/i).first().waitFor({
      state: 'visible',
      timeout,
    }),
  ].map((wait) => wait.then(() => true));

  return Promise.any(waits).catch(() => false);
}

async function clickEntityResult(page, entityName, { allowFirstResult = false } = {}) {
  if (entityName) {
    const flexibleEntityNamePattern = flexibleTextPattern(entityName);

    const exactLink = page.getByRole('link', { name: entityName, exact: true }).first();
    if (await clickResultCandidate(page, exactLink)) {
      return true;
    }

    const flexibleLink = page.locator('a').filter({ hasText: flexibleEntityNamePattern }).first();
    if (await clickResultCandidate(page, flexibleLink)) {
      return true;
    }

    const partialLink = page.locator('a').filter({ hasText: entityName }).first();
    if (await clickResultCandidate(page, partialLink)) {
      return true;
    }

    if (await clickNormalizedSearchResult(page, entityName)) {
      return true;
    }

    const matchingRow = page.locator('tr, div[role="row"]').filter({ hasText: entityName }).first();
    if (await clickResultCandidate(page, matchingRow)) {
      return true;
    }

    const flexibleMatchingRow = page.locator('tr, div[role="row"]').filter({ hasText: flexibleEntityNamePattern }).first();
    if (await clickResultCandidate(page, flexibleMatchingRow)) {
      return true;
    }

    const rowClickable = matchingRow.locator('a, button, [role="link"], [role="button"], td, span, div').filter({ hasText: entityName }).first();
    if (await clickResultCandidate(page, rowClickable)) {
      return true;
    }
  }

  if (allowFirstResult && await clickFirstSearchResult(page)) {
    return true;
  }

  return false;
}

async function clickNormalizedSearchResult(page, entityName) {
  const clicked = await page.evaluate((wantedText) => {
    const wanted = clean(wantedText);
    if (!wanted) return false;

    const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"], tr, [role="row"]'))
      .filter((element) => isVisible(element) && !isHeaderLike(element))
      .map((element) => ({
        element,
        text: clean(element.innerText || element.textContent),
      }))
      .filter((candidate) => candidate.text && candidate.text.includes(wanted));

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

    function clickableChild(element, text) {
      if (matchesClickable(element, text)) return element;
      return Array.from(element.querySelectorAll('a, button, [role="link"], [role="button"]'))
        .find((item) => matchesClickable(item, text)) || null;
    }

    function matchesClickable(element, text) {
      return isVisible(element) && clean(element.innerText || element.textContent).includes(text);
    }

    function scoreCandidate(text, wanted, element) {
      let score = 0;
      if (text === wanted) score += 100;
      if (text.startsWith(wanted)) score += 60;
      if (element.matches?.('a, button, [role="link"], [role="button"]')) score += 30;
      return score - Math.max(0, text.length - wanted.length) * 0.01;
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
  }, entityName).catch(() => false);

  if (!clicked) {
    return false;
  }

  await waitForAppIdle(page);
  return waitForEntityWorkspace(page, 'search result', {
    timeout: Math.min(10_000, baselineConfig.timeouts.navigationMs),
    required: false,
    settle: false,
  });
}

async function clickFirstSearchResult(page) {
  const candidateLocators = [
    page.locator('.ui-grid-canvas a').filter({ hasText: validResultTextPattern() }).first(),
    page.locator('.ui-grid-row a').filter({ hasText: validResultTextPattern() }).first(),
    page.locator('tbody tr a, table tr a').filter({ hasText: validResultTextPattern() }).first(),
    page.locator('.ui-grid-row, tbody tr, table tr, div[role="row"]')
      .filter({ hasText: validResultTextPattern() })
      .first(),
  ];

  for (const locator of candidateLocators) {
    if (await clickResultCandidate(page, locator)) {
      return true;
    }
  }

  const firstRow = page.locator('tbody tr, table tr, div[role="row"]')
    .filter({ hasText: validResultTextPattern() })
    .first();
  if (await clickResultCandidate(page, firstRow)) {
    return true;
  }

  return false;
}

function validResultTextPattern() {
  return /^(?!\s*(?:No matching record\(s\) found|Name\s+Business Unit\s+Entity ID|Business Unit\s+Entity ID|Export)\s*$).*\S/i;
}

function flexibleTextPattern(value) {
  const escaped = escapeRegex(value).replace(/\s+/g, '\\s+');
  return new RegExp(escaped, 'i');
}

async function clickResultCandidate(page, locator) {
  if (!await isValidSearchResultCandidate(locator)) {
    return false;
  }

  const beforeUrl = page.url();

  if (!await clickIfUsable(locator)) {
    return false;
  }

  await waitForAppIdle(page);

  if (await waitForEntityWorkspace(page, 'search result', {
    timeout: Math.min(10_000, baselineConfig.timeouts.navigationMs),
    required: false,
    settle: false,
  })) {
    return true;
  }

  if (page.url() !== beforeUrl && !await isNoMatchingSearchPage(page)) {
    return true;
  }

  return false;
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

    if (/^name business unit entity id/i.test(text) || /^business unit entity id/i.test(text) || /^export$/i.test(text)) {
      return false;
    }

    const role = await locator.evaluate((element) => {
      const row = element.closest?.('tr, [role="row"]');
      const hasHeaderCell = Boolean(row?.querySelector?.('th, [role="columnheader"]'));
      const isHeaderLike = /ui-grid-header|header/i.test(row?.className || element.className || '');

      return {
        hasHeaderCell,
        isHeaderLike,
      };
    }).catch(() => ({ hasHeaderCell: false, isHeaderLike: false }));

    return !role.hasHeaderCell && !role.isHeaderLike;
  } catch {
    return false;
  }
}

async function isNoMatchingSearchPage(page) {
  return await page.getByText(/No matching record\(s\) found/i).first().isVisible().catch(() => false);
}

export async function waitForEntityWorkspace(page, entityName, {
  timeout = baselineConfig.timeouts.navigationMs,
  required = true,
  settle = true,
} = {}) {
  const ready = await waitForWorkspaceSignal(page, timeout);

  if (!ready) {
    if (!required) {
      return false;
    }

    throw new Error(`Entity workspace did not become ready after opening "${entityName}". Capture cannot start from the current page.`);
  }

  if (settle) {
    await waitForAppIdle(page);
  }

  return true;
}

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
    .waitFor({
      state: 'visible',
      timeout,
    })
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
    const profileIdentifierRegexes = (workspace.profileIdentifierPatterns || ['\\b(?:Entity|Licensee)\\s+I[Dd]\\b']).map(regexFrom);
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
        (hasEntityInfoTab && hasMultipleProfileTabs) ||
        (hasReadyText && hasProfileIdentifier)
      );
  }, {
    selectors: tabSelectors,
    workspace: workspaceConfig,
  }).catch(() => false);
}

async function clickIfUsable(locator) {
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

async function isLocatorVisibleSafe(locator) {
  try {
    return (await locator.count()) > 0 && await locator.isVisible();
  } catch {
    return false;
  }
}

async function inputNearLabelExists(page, labelText) {
  return page.evaluate(({ labelText, finderSource }) => {
    const findInputNearLabel = Function(`return (${finderSource})`)();
    return Boolean(findInputNearLabel(labelText));
  }, {
    labelText,
    finderSource: findInputNearLabel.toString(),
  }).catch(() => false);
}

async function fillInputNearLabel(page, labelText, value) {
  return page.evaluate(({ labelText, value, finderSource }) => {
    const findInputNearLabel = Function(`return (${finderSource})`)();
    const input = findInputNearLabel(labelText);
    if (!input) {
      return false;
    }

    input.focus?.();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur?.();
    return true;
  }, {
    labelText,
    value,
    finderSource: findInputNearLabel.toString(),
  }).catch(() => false);
}

async function fillIfUsable(locator, value) {
  try {
    if ((await locator.count()) === 0) {
      return false;
    }

    if (!(await locator.isVisible())) {
      return false;
    }

    await locator.fill(value);
    return true;
  } catch {
    return false;
  }
}

function findInputNearLabel(labelText) {
  const wanted = clean(labelText);
  const controls = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'))
    .filter((control) => isVisible(control) && !control.disabled && !control.readOnly);
  const ranked = controls
    .map((control, index) => ({
      control,
      score: scoreControl(control, index),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.control || null;

  function scoreControl(control, index) {
    const labels = clean([
      control.id,
      control.name,
      control.getAttribute('aria-label'),
      control.getAttribute('title'),
      control.getAttribute('placeholder'),
      Array.from(control.labels || []).map((label) => label.textContent).join(' '),
      nearbyLabelText(control),
    ].join(' '));

    let score = 0;
    if (labels === wanted) score += 70;
    if (labels.includes(wanted)) score += 45;
    if (wanted.includes(labels) && labels.length > 3) score += 25;
    return score - (index * 0.01);
  }

  function nearbyLabelText(control) {
    const parts = [];

    const cell = control.closest('td, th, .form-group, .row, div');
    if (cell?.previousElementSibling) {
      parts.push(cell.previousElementSibling.textContent || '');
    }

    const row = control.closest('tr');
    if (row) {
      const cells = Array.from(row.children);
      const cellIndex = cells.findIndex((item) => item.contains(control));
      if (cellIndex > 0) {
        parts.push(cells[cellIndex - 1].textContent || '');
      }
    }

    const parent = control.parentElement;
    if (parent) {
      const siblings = Array.from(parent.childNodes);
      const index = siblings.indexOf(control);
      parts.push(...siblings.slice(Math.max(0, index - 3), index).map((node) => node.textContent || ''));
    }

    return parts.join(' ');
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0
    );
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
