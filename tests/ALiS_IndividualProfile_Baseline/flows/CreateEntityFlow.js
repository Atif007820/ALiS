import { openIndividualProfileMenu, waitForAppIdle } from './navigation.js';
import { ensureUiActionValues, runUiActions } from '../utils/uiActions.js';
import { baselineConfig } from '../config/baseline.config.js';
import { logger } from '../utils/logger.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';
import { waitForProfileWorkspace } from './ModifySearchFlow.js';

export function classifyCreateSaveState(bodyText, path, saveVisible = false) {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normalizedBodyText = clean(bodyText);
  const normalizedPath = clean(path);
  const saved = (
    /\/SuccessPage\.aspx/i.test(normalizedPath)
    || /Individual Profile has been saved successfully/i.test(normalizedBodyText)
    || /Individual has been saved successfully/i.test(normalizedBodyText)
    || /saved successfully/i.test(normalizedBodyText)
    || /return to search/i.test(normalizedBodyText)
    || (
      /\b(?:Modify|View)?\s*Individual\b/i.test(normalizedBodyText)
      && /\bReturn to Search\b/i.test(normalizedBodyText)
    )
  );

  if (saved) {
    return { status: 'saved', message: `Saved page: ${normalizedPath}` };
  }

  if (/License\/Credential information details/i.test(normalizedBodyText)) {
    return { status: 'validation', message: 'License/Credential information details' };
  }

  const validationPatterns = [
    /Please review following errors and correct them\.?\s*(.*?)(?:Application Details|Mailing Address|$)/i,
    /(The following field contains invalid characters:[^.]*\.?)/i,
    /(?:^|\s)((?:[A-Za-z][A-Za-z0-9 #/().'-]*\s+)?is a required field\.?)/i,
    /(?:^|\s)(Please (?:enter|select|provide)[^.]*\.)/i,
  ];

  for (const pattern of validationPatterns) {
    const match = normalizedBodyText.match(pattern);
    const message = clean(match?.[1] || '');
    if (message && !/^Fields marked with asterisk/i.test(message)) {
      return { status: 'validation', message };
    }
  }

  const stillCreateForm = /\bNew Individual\b/i.test(normalizedBodyText);

  return {
    status: 'pending',
    message: `URL=${normalizedPath}, stillCreateForm=${stillCreateForm}, saveVisible=${saveVisible}`,
  };
}

export async function createProfile(page, { businessUnit }) {
  const actionContext = {
    businessUnit,
    firstName: businessUnit.firstName,
    lastName: businessUnit.lastName,
    fullName: businessUnit.fullName,
    entityName: businessUnit.entityName,
  };

  await openIndividualProfileMenu(page, 'New', { businessUnit });
  await waitForAppIdle(page);
  await runUiActions(page, businessUnit.createProfileActions || [], actionContext);
  await waitForAppIdle(page);

  await runUiActions(page, businessUnit.profileFields || [], actionContext);
  await ensureUiActionValues(page, businessUnit.profileFields || [], actionContext);

  await saveCreatedProfile(page, {
    repairForm: async () => {
      await repairLicenseCredentialDetails(page, businessUnit, actionContext);
      await runUiActions(page, businessUnit.profileFields || [], actionContext);
      await ensureUiActionValues(page, businessUnit.profileFields || [], actionContext);
    },
  });

  await waitForAppIdle(page);

  const workspaceReady = await waitForProfileWorkspace(page, businessUnit.fullName, {
    timeout: Math.min(8_000, baselineConfig.timeouts.navigationMs),
    required: false,
    settle: false,
  });

  return {
    firstName: businessUnit.firstName,
    lastName: businessUnit.lastName,
    fullName: businessUnit.fullName,
    entityName: businessUnit.fullName,
    profileName: {
      firstName: businessUnit.firstName,
      lastName: businessUnit.lastName,
    },
    workspaceReady,
  };
}

export const createEntity = createProfile;

async function repairLicenseCredentialDetails(page, businessUnit, actionContext) {
  const actions = licenseCredentialActions(businessUnit);
  if (!actions.length) {
    return;
  }

  logger.warn('Restoring configured License/Credential details before retrying profile Save.');
  await runUiActions(page, actions, actionContext);
  await runUiActions(page, [{ type: 'reloadCurrentPage', waitAfterReloadMs: 1_000 }], actionContext);
  await waitForAppIdle(page);
}

function licenseCredentialActions(businessUnit) {
  const configuredActions = businessUnit.licenseCredentialActions;
  if (Array.isArray(configuredActions) && configuredActions.length) {
    return configuredActions;
  }

  return (businessUnit.createProfileActions || []).filter((action) => {
    const label = `${action.name || ''} ${action.label || ''}`.toLowerCase();
    return label.includes('license/credential');
  });
}

async function saveCreatedProfile(page, { repairForm } = {}) {
  const attempts = 4;
  let lastState = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastState = await readCreateSaveState(page);

    if (lastState.status === 'saved') {
      return;
    }

    if (lastState.status === 'validation') {
      if (attempt < attempts && repairForm && isRecoverableRequiredFieldValidation(lastState.message)) {
        logger.warn(
          `Create Save reported required fields before clicking Save on attempt ${attempt}; restoring the configured profile values and retrying.`,
        );
        await repairForm();
        continue;
      }
    }

    const clicked = await clickSave(page);
    if (!clicked) {
      if (lastState.status === 'pending' && /Saved page:/i.test(lastState.message)) {
        return;
      }
      throw new Error('Could not find individual profile Save control.');
    }

    await waitForAppIdle(page);
    lastState = await readCreateSaveState(page);

    if (lastState.status === 'saved') {
      return;
    }

    if (lastState.status === 'validation') {
      if (attempt < attempts && repairForm && isRecoverableRequiredFieldValidation(lastState.message)) {
        logger.warn(
          `Create Save reported required fields after a dynamic refresh on attempt ${attempt}; restoring the configured profile values and retrying.`,
        );
        await repairForm();
        continue;
      }

      throw new Error(`Create profile was not saved. Validation error: ${lastState.message}`);
    }

    if (attempt < attempts) {
      await waitForPageTimeout(page, 500, 'retrying ignored profile Save action');
    }
  }

  throw new Error(
    `Create Save did not reach a persisted individual profile after ${attempts} attempts. ${lastState?.message || ''}`.trim(),
  );
}

async function clickSave(page) {
  const timeoutMs = baselineConfig.timeouts.actionMs || 15_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    for (const candidate of saveLocators(page)) {
      if (await clickIfVisible(candidate)) {
        return true;
      }
    }

    if (await clickSaveByDom(page)) {
      return true;
    }

    await waitForPageTimeout(page, 300, 'waiting for individual profile Save control');
    await waitForAppIdle(page).catch(() => {});
  }

  return false;
}

function saveLocators(page) {
  return [
    page.getByRole('link', { name: 'Save', exact: true }).first(),
    page.getByRole('button', { name: 'Save', exact: true }).first(),
    page.getByRole('link', { name: /^Save\b/i }).first(),
    page.getByRole('button', { name: /^Save\b/i }).first(),
    page.locator([
      'input[type="submit"][value*="Save" i]',
      'input[type="button"][value*="Save" i]',
      'input[type="image"][alt*="Save" i]',
      'a[title*="Save" i]',
      'button[title*="Save" i]',
      '[role="button"][aria-label*="Save" i]',
      '[role="link"][aria-label*="Save" i]',
      '[id*="Save" i]',
      '[name*="Save" i]',
    ].join(',')).first(),
    page.locator('a:has-text("Save"), button:has-text("Save")').first(),
  ];
}

async function clickSaveByDom(page) {
  try {
    return await page.evaluate(() => {
      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      }

      function labelFor(element) {
        return [
          element.textContent,
          element.value,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('alt'),
          element.getAttribute('id'),
          element.getAttribute('name'),
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function scoreSaveControl(element) {
        const label = labelFor(element);
        const normalized = label.toLowerCase();
        if (!normalized.includes('save')) {
          return 0;
        }

        if (/\b(search|cancel|reset|delete)\b/i.test(label) && !/^save\b/i.test(label)) {
          return 0;
        }

        let score = 1;
        if (/^save$/i.test(label)) score += 30;
        if (/^save\b/i.test(label)) score += 20;
        if (element.matches('input[type="submit"], input[type="button"], button, a')) score += 5;
        if (element.id && /save/i.test(element.id)) score += 3;
        if (element.name && /save/i.test(element.name)) score += 3;
        return score;
      }

      const controls = Array.from(document.querySelectorAll([
        'a',
        'button',
        'input[type="submit"]',
        'input[type="button"]',
        'input[type="image"]',
        '[role="button"]',
        '[role="link"]',
      ].join(',')))
        .filter(isVisible)
        .map((element) => ({ element, score: scoreSaveControl(element) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score);

      const target = controls[0]?.element;
      if (!target) {
        return false;
      }

      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.click();
      return true;
    });
  } catch {
    return false;
  }
}

async function readCreateSaveState(page) {
  try {
    const state = await page.evaluate(() => {
      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      }

      function labelFor(element) {
        return [
          element.textContent,
          element.value,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('alt'),
          element.getAttribute('id'),
          element.getAttribute('name'),
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const bodyText = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      const path = location.pathname;
      const saveVisible = Array.from(document.querySelectorAll([
        'button',
        'a',
        'input[type="submit"]',
        'input[type="button"]',
        'input[type="image"]',
        '[role="button"]',
        '[role="link"]',
      ].join(',')))
        .filter(isVisible)
        .some((element) => /^save\b/i.test(labelFor(element)));

      return { bodyText, path, saveVisible };
    });

    return classifyCreateSaveState(state.bodyText, state.path, state.saveVisible);
  } catch {
    return {
      status: 'pending',
      message: `URL=${page.url()}, page state unavailable`,
    };
  }
}

function isRecoverableRequiredFieldValidation(message) {
  return /\bis a required field\b|\bare required\b|License\/Credential information details/i.test(String(message || ''));
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
