import { openIndividualProfileMenu, waitForAppIdle } from './navigation.js';
import { ensureUiActionValues, runUiActions } from '../utils/uiActions.js';
import { baselineConfig } from '../config/baseline.config.js';
import { logger } from '../utils/logger.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';
import { waitForProfileWorkspace } from './ModifySearchFlow.js';

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
    const clicked = await clickSave(page);
    if (!clicked) {
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
  const candidates = [
    page.getByRole('link', { name: 'Save', exact: true }).first(),
    page.getByRole('button', { name: 'Save', exact: true }).first(),
    page.locator('input[type="submit"][value="Save"], input[type="button"][value="Save"]').first(),
  ];

  for (const candidate of candidates) {
    if (await clickIfVisible(candidate)) {
      return true;
    }
  }

  return false;
}

async function readCreateSaveState(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const bodyText = clean(document.body?.innerText);
    const path = location.pathname;
    const saved = (
      /\/SuccessPage\.aspx$/i.test(path)
      || /Individual Profile has been saved successfully/i.test(bodyText)
      || /Individual has been saved successfully/i.test(bodyText)
      || (
        /\b(?:Modify|View)?\s*Individual\b/i.test(bodyText)
        && /\bReturn to Search\b/i.test(bodyText)
      )
    );

    if (saved) {
      return { status: 'saved', message: `Saved page: ${path}` };
    }

    const validationPatterns = [
      /Please review following errors and correct them\.?\s*(.*?)(?:Application Details|Mailing Address|$)/i,
      /(The following field contains invalid characters:[^.]*\.?)/i,
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

    const stillCreateForm = /\bNew Individual\b/i.test(bodyText);
    const saveVisible = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'))
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
