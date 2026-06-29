import { openBusinessEntityMenu, waitForAppIdle } from './navigation.js';
import {
  clickFirstVisible,
  clickIfVisible,
  ensureUiActionValues,
  runUiActions,
} from '../utils/uiActions.js';
import { baselineConfig } from '../config/baseline.config.js';
import { waitForEntityWorkspace } from './ModifySearchFlow.js';
import { logger } from '../utils/logger.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';

export async function createEntity(page, { businessUnit, entityName }) {
  const resolvedEntityName = entityName || buildEntityName(businessUnit.entityPrefix);
  const actionContext = {
    businessUnit,
    entityName: resolvedEntityName,
  };

  await openBusinessEntityMenu(page, 'New', { businessUnit });
  await selectCreateBusinessUnit(page, businessUnit, resolvedEntityName);
  await waitForAppIdle(page);

  await runUiActions(page, businessUnit.beforeCreateEntityActions || [], actionContext);

  await fillEntityName(page, businessUnit, resolvedEntityName);

  for (const field of businessUnit.createEntityFields) {
    await runUiActions(page, [field], actionContext);
  }

  await runUiActions(page, businessUnit.beforeCreateSaveActions || [], actionContext);
  const stabilizeCreateForm = async () => {
    await waitForAppIdle(page);
    await fillEntityName(page, businessUnit, resolvedEntityName);
    await ensureUiActionValues(
      page,
      [
        ...(businessUnit.createEntityFields || []),
        ...(businessUnit.beforeCreateSaveActions || []),
      ],
      actionContext,
    );
  };
  const prepareCreateFormForSave = async () => {
    await stabilizeCreateForm();
    await runUiActions(page, businessUnit.finalCreateSaveActions || [], actionContext);

    // ASP.NET popup callbacks can clear parent-form text values when they close.
    // Restore only values that no longer match, after the required detail exists.
    await stabilizeCreateForm();
  };
  await prepareCreateFormForSave();

  await saveCreatedEntity(page, businessUnit, {
    repairForm: prepareCreateFormForSave,
    recoverValidation: async (message) => {
      const recoveryRule = findCreateValidationRecoveryRule(
        businessUnit.createValidationRecoveryRules,
        message,
      );

      if (!recoveryRule) {
        return false;
      }

      logger.warn(
        `Create Save reported "${message}" after a dynamic refresh; rebuilding the required detail and retrying.`,
      );
      await stabilizeCreateForm();
      await runUiActions(page, recoveryRule.actions || [], actionContext);
      await stabilizeCreateForm();
      return true;
    },
  });
  await waitForAppIdle(page);
  await assertCreateSaveDidNotShowValidationErrors(page);
  const createdReference = await captureCreatedEntityReference(page, businessUnit, resolvedEntityName);
  const openedFromSuccessPage = businessUnit.preferPostCreateEditLink
    ? await openCreatedProfileFromSuccessPage(page, createdReference.entityName || resolvedEntityName)
    : false;
  const workspaceReady = openedFromSuccessPage || await waitForEntityWorkspace(
    page,
    createdReference.entityName || resolvedEntityName,
    {
      timeout: 8_000,
      required: false,
      settle: false,
    },
  );

  if (!workspaceReady && !createdReference.entityId) {
    const diagnostics = await capturePostCreateDiagnostics(page);
    logger.info(`Create Save did not expose a persisted profile signal. ${diagnostics}`);
  }

  return {
    entityName: createdReference.entityName || resolvedEntityName,
    entityId: createdReference.entityId,
    searchFallbacks: businessUnit.modifySearchFallbacks || [],
    workspaceReady,
    openedFromSuccessPage,
  };
}

async function openCreatedProfileFromSuccessPage(page, entityName) {
  const successPage = await page.evaluate(() => {
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return /Business Entity has been saved successfully/i.test(text)
      || /\/SuccessPage\.aspx/i.test(location.pathname);
  }).catch(() => false);

  if (!successPage) {
    return false;
  }

  const editLink = page.getByRole('link', { name: 'Edit', exact: true }).first();
  if (!await clickIfVisible(editLink)) {
    logger.info('Post-create success page was detected, but its Edit link was not available; Modify search will be used.');
    return false;
  }

  await waitForAppIdle(page);
  const ready = await waitForEntityWorkspace(page, entityName, {
    timeout: baselineConfig.timeouts.navigationMs,
    required: false,
  });

  if (ready) {
    logger.info(`Opened the newly saved profile directly from the post-create Edit link: ${entityName}`);
  }

  return ready;
}

async function capturePostCreateDiagnostics(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };
    const texts = Array.from(document.querySelectorAll(
      '[role="alert"], .alert, .validation-summary-errors, .field-validation-error, .error, .message, .toast, h1, h2, h3',
    ))
      .filter(visible)
      .map((element) => clean(element.textContent))
      .filter(Boolean)
      .slice(0, 12);
    const saveVisible = Array.from(document.querySelectorAll('button, a, input[type="submit"]'))
      .filter(visible)
      .some((element) => /^save$/i.test(clean(element.textContent || element.value)));

    return [
      `URL=${location.href}`,
      `title="${clean(document.title)}"`,
      `saveVisible=${saveVisible}`,
      `messages=[${texts.join(' | ')}]`,
    ].join(', ');
  }).catch(() => `URL=${page.url()}, diagnostics unavailable`);
}

async function assertCreateSaveDidNotShowValidationErrors(page) {
  const validation = await page.evaluate(() => {
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/Please review following errors and correct them\.\s*(.*?)(?:Application Details|Facility Information|Mailing Address|$)/i);
    return match?.[1]?.trim() || '';
  }).catch(() => '');

  if (validation) {
    throw new Error(`Create entity was not saved. Validation error: ${validation}`);
  }
}

async function selectCreateBusinessUnit(page, businessUnit, entityName) {
  let lastError;

  if (businessUnit.createBusinessUnitActions?.length) {
    try {
      await runUiActions(page, businessUnit.createBusinessUnitActions, {
        businessUnit,
        entityName,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const optionText = businessUnit.createBusinessUnitOption || businessUnit.name || businessUnit.createBusinessUnitValue;
  const nativeSelect = page.getByLabel('Business Unit').first();

  for (const option of [
    businessUnit.createBusinessUnitValue ? { value: businessUnit.createBusinessUnitValue } : null,
    optionText ? { label: optionText } : null,
  ].filter(Boolean)) {
    try {
      await nativeSelect.selectOption(option, { timeout: baselineConfig.timeouts.actionMs });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const triggers = [
    page.getByRole('textbox', { name: /-- Choose One --|Business Unit/i }).first(),
    page.locator('.select2-selection').filter({ hasText: /-- Choose One --|Business Unit/i }).first(),
    page.locator('[id*="select2"][id*="container"]').filter({ hasText: /-- Choose One --/i }).first(),
  ];

  for (const trigger of triggers) {
    if (!(await clickIfVisible(trigger))) {
      continue;
    }

    const option = page.getByRole('option', { name: optionText, exact: true }).first()
      .or(page.getByRole('option', { name: optionText }).first())
      .or(page.getByText(optionText, { exact: true }).first());

    if (await clickIfVisible(option)) {
      return;
    }
  }

  throw lastError || new Error(`Could not select create Business Unit "${optionText}".`);
}

async function fillEntityName(page, businessUnit, entityName) {
  const fieldSelectors = businessUnit.createEntityNameSelectors || [];

  for (const selector of fieldSelectors) {
    const field = page.locator(selector).first();
    if (await fillIfVisible(field, entityName)) {
      return;
    }
  }

  const fieldNames = businessUnit.createEntityNameFieldNames?.length
    ? businessUnit.createEntityNameFieldNames
    : ['Entity Name (Legal Name)'];

  for (const fieldName of fieldNames) {
    const textbox = page.getByRole('textbox', { name: fieldName }).first();
    if (await fillIfVisible(textbox, entityName)) {
      return;
    }

    const labelledField = page.getByLabel(fieldName).first();
    if (await fillIfVisible(labelledField, entityName)) {
      return;
    }
  }

  throw new Error(`Could not find create entity name field. Tried: ${fieldNames.join(', ')}`);
}

async function saveCreatedEntity(page, businessUnit, {
  repairForm,
  recoverValidation,
} = {}) {
  const saveNames = businessUnit.createSaveNames?.length ? businessUnit.createSaveNames : ['Save'];
  const candidates = saveNames.flatMap((name) => [
    (currentPage) => currentPage.getByRole('button', { name, exact: true }).first(),
    (currentPage) => currentPage.getByRole('link', { name, exact: true }).first(),
  ]);
  const attempts = Math.max(1, Number(businessUnit.createSaveAttempts || 3));
  let lastState = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!await clickFirstVisible(page, candidates)) {
      throw new Error(`Could not find create entity Save control. Tried: ${saveNames.join(', ')}`);
    }

    await waitForAppIdle(page);
    lastState = await waitForCreateSaveOutcome(page);

    if (lastState.status === 'saved') {
      return;
    }

    if (lastState.status === 'validation') {
      const recovered = attempt < attempts && recoverValidation
        ? await recoverValidation(lastState.message)
        : false;

      if (recovered) {
        continue;
      }

      if (
        attempt < attempts
        && repairForm
        && isRecoverableRequiredFieldValidation(lastState.message)
      ) {
        logger.warn(
          `Create Save reported required fields after a dynamic refresh on attempt ${attempt}; restoring the configured form values and retrying.`,
        );
        await repairForm();
        continue;
      }

      throw new Error(`Create entity was not saved. Validation error: ${lastState.message}`);
    }

    if (attempt < attempts) {
      logger.info(
        `Create Save remained on the editable form after attempt ${attempt}; retrying the same Save action.`,
      );
      await waitForPageTimeout(page, 500, 'retrying ignored create Save action');
    }
  }

  throw new Error(
    `Create Save did not reach a persisted profile after ${attempts} attempts. ${lastState?.message || ''}`.trim(),
  );
}

function isRecoverableRequiredFieldValidation(message) {
  return /\bis a required field\b|\bare required\b/i.test(String(message || ''));
}

function findCreateValidationRecoveryRule(rules = [], message = '') {
  const validationMessage = String(message || '');

  return rules.find((rule) => {
    const pattern = rule?.messagePattern;
    if (!pattern) {
      return false;
    }

    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(validationMessage);
    }

    return validationMessage.toLowerCase().includes(String(pattern).toLowerCase());
  });
}

async function waitForCreateSaveOutcome(page) {
  const timeoutMs = baselineConfig.timeouts.postCreateProfileReadyMs || 20_000;
  const deadline = Date.now() + timeoutMs;
  let latestState = { status: 'pending', message: '' };

  while (Date.now() <= deadline) {
    latestState = await readCreateSaveState(page);

    if (latestState.status !== 'pending') {
      return latestState;
    }

    await waitForPageTimeout(page, 250, 'waiting for create Save outcome');
  }

  return latestState;
}

async function readCreateSaveState(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = clean(document.body?.innerText);
    const path = location.pathname;
    const saved = (
      /\/SuccessPage\.aspx$/i.test(path)
      || /Business Entity has been saved successfully/i.test(bodyText)
      || (
        /\bModify Business Entity\b/i.test(bodyText)
        && /\bReturn to Search\b/i.test(bodyText)
      )
    );

    if (saved) {
      return { status: 'saved', message: `Saved page: ${path}` };
    }

    const validationPatterns = [
      /Please review following errors and correct them\.?\s*(.*?)(?:Application Details|Facility Information|Mailing Address|$)/i,
      /(?:^|\s)((?:[A-Za-z][A-Za-z0-9 #/().'-]*\s+)?is a required field\.?)/i,
      /(?:^|\s)(Please (?:enter|select|provide)[^.]*\.)/i,
    ];

    for (const pattern of validationPatterns) {
      const match = bodyText.match(pattern);
      const message = clean(match?.[1] || '');
      if (message && !/^Fields marked with asterisk/i.test(message)) {
        return { status: 'validation', message };
      }
    }

    const stillCreateForm = /\bNew Business Entity\b/i.test(bodyText);
    const saveVisible = Array.from(document.querySelectorAll('button, a, input[type="submit"]'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      })
      .some((element) => /^save$/i.test(clean(element.textContent || element.value)));

    return {
      status: 'pending',
      message: `URL=${location.href}, stillCreateForm=${stillCreateForm}, saveVisible=${saveVisible}`,
    };
  }).catch(() => ({
    status: 'pending',
    message: `URL=${page.url()}, page state unavailable`,
  }));
}

async function fillIfVisible(locator, value) {
  try {
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    await locator.fill(value);
    return true;
  } catch {
    return false;
  }
}

async function captureCreatedEntityReference(page, businessUnit, entityName) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /(?:^|\n)\s*(?:Entity|Licensee)\s+I[Dd]\s*:?\s*(?:\n|\s)+\d+/i.test(text);
  }, null, {
    timeout: baselineConfig.timeouts.postCreateProfileReadyMs || 6_000,
  }).catch(() => {});

  const savedEntityName = await readCreatedEntityName(page, businessUnit);
  const entityId = await readCreatedEntityId(page);

  return {
    entityName: savedEntityName || entityName,
    entityId,
  };
}

async function readCreatedEntityName(page, businessUnit) {
  const fieldSelectors = businessUnit.createEntityNameSelectors || [];

  for (const selector of fieldSelectors) {
    const value = await readInputValue(page.locator(selector).first());
    if (value) {
      return value;
    }
  }

  const fieldNames = businessUnit.createEntityNameFieldNames?.length
    ? businessUnit.createEntityNameFieldNames
    : ['Entity Name (Legal Name)'];

  for (const fieldName of fieldNames) {
    const value = await readInputValue(page.getByRole('textbox', { name: fieldName }).first())
      || await readInputValue(page.getByLabel(fieldName).first());

    if (value) {
      return value;
    }
  }

  return page.evaluate(() => {
    const text = String(document.body?.innerText || '').replace(/\r/g, '');
    const match = text.match(/(?:^|\n)\s*Name\s*:\s*([^\n]+)/i);
    return String(match?.[1] || '').trim();
  }).catch(() => '');
}

async function readInputValue(locator) {
  try {
    if ((await locator.count()) === 0) {
      return '';
    }

    const value = await locator.inputValue({ timeout: 1_000 });
    return String(value || '').trim();
  } catch {
    return '';
  }
}

async function readCreatedEntityId(page) {
  return page.evaluate(() => {
    const lines = String(document.body?.innerText || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      if (/^(?:Entity|Licensee)\s+I[Dd]$/i.test(lines[index]) && /^\d+$/.test(lines[index + 1] || '')) {
        return lines[index + 1];
      }
    }

    const joined = lines.join('\n');
    const lineMatch = joined.match(/(?:^|\n)(?:Entity|Licensee)\s+I[Dd]\s*\n\s*(\d+)/i);
    if (lineMatch) {
      return lineMatch[1];
    }

    const inlineMatch = joined.match(/(?:Entity|Licensee)\s+I[Dd]\s*:?\s+(\d+)/i);
    return inlineMatch?.[1] || '';
  }).catch(() => '');
}

function buildEntityName(prefix) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const time = `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;

  return `${prefix}_${date}_${time}`;
}
