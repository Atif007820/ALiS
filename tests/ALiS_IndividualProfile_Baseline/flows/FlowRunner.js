import { login } from './LoginFlow.js';
import { createProfile } from './CreateEntityFlow.js';
import {
  openProfileFromModifySearch,
  openProfileFromViewSearch,
} from './ModifySearchFlow.js';
import { CaptureEngine } from '../core/CaptureEngine.js';
import { getSupportedFlowText } from '../utils/flowLabels.js';
import { logger } from '../utils/logger.js';

export async function executeFlow(page, { flow, environment, businessUnit, credentials, entityName }) {
  const selectedFlow = String(flow);
  await login(page, { environment, credentials });

  if (selectedFlow === '1' || selectedFlow === '3') {
    const created = await createProfile(page, { businessUnit });
    logger.info(`Stored created individual profile: ${created.fullName}`);

    if (
      selectedFlow === '1'
      && created.workspaceReady
      && !businessUnit.alwaysSearchAfterCreate
    ) {
      logger.info('Created individual profile is already open; using the saved profile for New Entity - Modify comparison.');
      return created;
    }

    await login(page, { environment, credentials });
    logger.info(`Searching stored individual profile in Modify: ${created.fullName}`);

    const openedInModify = await openProfileFromModifySearch(page, {
      businessUnit,
      profileName: created.profileName,
    });

    if (selectedFlow === '1') {
      return openedInModify;
    }

    await prepareCreatedProfileForViewComparison(page, businessUnit);

    await login(page, { environment, credentials });
    logger.info(`Searching stored individual profile in View: ${created.fullName}`);

    return openProfileFromViewSearch(page, {
      businessUnit,
      profileName: created.profileName,
    });
  }

  if (selectedFlow === '2' || selectedFlow === '4') {
    const searchAction = selectedFlow === '4' ? 'View' : 'Modify';
    const openProfileFromSearch = selectedFlow === '4'
      ? openProfileFromViewSearch
      : openProfileFromModifySearch;
    const configuredProfileName = selectedFlow === '4'
      ? businessUnit.flow4ProfileName || businessUnit.flow2ProfileName
      : businessUnit.flow2ProfileName;
    const searchProfileName = parseProfileNameOverride(entityName) || configuredProfileName;
    logger.info(`Flow ${selectedFlow} ${searchAction} profile name: ${formatProfileName(searchProfileName)}`);

    return openProfileFromSearch(page, {
      businessUnit,
      profileName: searchProfileName,
    });
  }

  throw new Error(`Unsupported flow "${flow}". Use ${getSupportedFlowText()}.`);
}

async function prepareCreatedProfileForViewComparison(page, businessUnit) {
  const preconditions = Object.entries(businessUnit.tableHeaderPreconditions || {});
  if (!preconditions.length) {
    logger.info('No Modify preconditions configured before View comparison.');
    return;
  }

  const captureEngine = new CaptureEngine();
  const visibleTabs = await captureEngine.captureTabs(page).catch(() => []);
  const tabsWithPreconditions = visibleTabs
    .filter((tabName) => captureEngine.tableHeaderPreconditionForTab(businessUnit, tabName));
  const fallbackTabs = preconditions.map(([tabName]) => tabName);
  const tabsToPrepare = uniqueNormalizedValues(tabsWithPreconditions.length ? tabsWithPreconditions : fallbackTabs);

  logger.info(`Running ${tabsToPrepare.length} Modify precondition(s) before View comparison.`);

  for (const tabName of tabsToPrepare) {
    await captureEngine.prepareTabForCapture(page, tabName);
    const existingHeaders = await captureEngine.captureTableColumnHeaders(page, tabName).catch(() => []);
    if (existingHeaders.length) {
      logger.info(`Skipping ${tabName} Modify precondition because table headers are already visible.`);
      continue;
    }

    await captureEngine.ensureTableHeaderPreconditions(page, tabName, businessUnit);
  }

  if (captureEngine.warnings.length) {
    captureEngine.warnings.forEach((warning) => logger.info(`Precondition warning: ${warning}`));
  }
}

function parseProfileNameOverride(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  const commaParts = text.split(',').map((item) => item.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      lastName: commaParts[0],
      firstName: commaParts[1],
    };
  }

  const parts = text.split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function formatProfileName(profileName) {
  return [profileName?.firstName, profileName?.lastName].filter(Boolean).join(' ');
}

function uniqueNormalizedValues(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(text);
  }

  return unique;
}
