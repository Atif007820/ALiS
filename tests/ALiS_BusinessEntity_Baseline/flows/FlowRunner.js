import { login } from './LoginFlow.js';
import { createEntity } from './CreateEntityFlow.js';
import {
  openEntityFromModifySearch,
  openEntityFromViewSearch,
} from './ModifySearchFlow.js';
import { CaptureEngine } from '../core/CaptureEngine.js';
import { getSupportedFlowText } from '../utils/flowLabels.js';
import { logger } from '../utils/logger.js';

export async function executeFlow(page, { flow, environment, businessUnit, credentials, entityName }) {
  const selectedFlow = String(flow);
  await login(page, { environment, credentials });

  if (selectedFlow === '1' || selectedFlow === '3') {
    const created = await createEntity(page, { businessUnit });
    logger.info(`Stored created facility/entity name: ${created.entityName}`);
    if (created.entityId) {
      logger.info(`Captured created Entity ID: ${created.entityId}`);
    }

    if (
      selectedFlow === '1'
      &&
      created.workspaceReady
      && (created.openedFromSuccessPage || !businessUnit.alwaysSearchAfterCreate)
    ) {
      logger.info('Created facility/entity profile is already open; using the saved profile for New Entity - Modify comparison.');
      return created;
    }

    await login(page, { environment, credentials });
    logger.info(`Searching stored facility/entity name in Modify: ${created.entityName}`);

    const openedInModify = await openEntityFromModifySearch(page, {
      businessUnit,
      entityName: created.entityName,
      entityId: created.entityId,
      searchFallbacks: created.searchFallbacks,
    });

    if (selectedFlow === '1') {
      return openedInModify;
    }

    await prepareCreatedEntityForViewComparison(page, businessUnit);

    await login(page, { environment, credentials });
    logger.info(`Searching stored facility/entity name in View: ${created.entityName}`);

    return openEntityFromViewSearch(page, {
      businessUnit,
      entityName: created.entityName,
      entityId: created.entityId,
      searchFallbacks: created.searchFallbacks,
    });
  }

  if (selectedFlow === '2' || selectedFlow === '4') {
    const searchAction = selectedFlow === '4' ? 'View' : 'Modify';
    const openEntityFromSearch = selectedFlow === '4'
      ? openEntityFromViewSearch
      : openEntityFromModifySearch;
    const configuredEntityName = selectedFlow === '4'
      ? businessUnit.flow4EntityName || businessUnit.flow2EntityName
      : businessUnit.flow2EntityName;
    const searchEntityName = entityName || configuredEntityName;
    logger.info(`Flow ${selectedFlow} ${searchAction} entity name: ${searchEntityName}`);

    return openEntityFromSearch(page, {
      businessUnit,
      entityName: searchEntityName,
    });
  }

  throw new Error(`Unsupported flow "${flow}". Use ${getSupportedFlowText()}.`);
}

async function prepareCreatedEntityForViewComparison(page, businessUnit) {
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
