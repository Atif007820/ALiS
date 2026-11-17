import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { getApplicationTarget } from '../config/runConfig.js';
import { VARIANCE_INSTALLATION_APP_TYPES } from '../config/applicationTypes.js';
import { BASE_URL } from '../config/URL.js';

export function normalizeTransactionNumber(value) {
  const transactionNumber = String(value ?? '').trim();
  if (!/^\d+$/.test(transactionNumber)) {
    throw new Error('The Conveyance transaction number must contain digits only.');
  }
  return transactionNumber;
}

export function normalizeConveyanceNumber(value) {
  const number = String(value ?? '').trim();
  if (!/^\d+$/.test(number)) throw new Error('The captured Conveyance # must contain digits only.');
  return number;
}

function identity(testInfo, env) {
  const { appType, perType, endorsement } = getApplicationTarget(env);
  return {
    runId: env.CONVEYANCE_RUN_ID || '',
    appType,
    perType,
    requestedEndorsement: endorsement?.code ?? '',
    baseUrl: BASE_URL,
    project: testInfo?.project?.name || '',
    repeatIndex: Number(env.CONVEYANCE_FLOW_REPEAT ?? testInfo?.repeatEachIndex ?? 0),
    testRepeatIndex: Number(testInfo?.repeatEachIndex ?? 0),
  };
}

function handoffPath(env) {
  const path = env.CONVEYANCE_TRANSACTION_PATH;
  if (!path || !isAbsolute(path) || !env.CONVEYANCE_RUN_ID) {
    throw new Error('Current-run approval requires an absolute transaction handoff path and fresh run ID from scripts/run-conveyance.mjs.');
  }
  return path;
}

/** Persist only a confirmed 02 result, never credentials or a shared latest transaction. */
export function saveApplicationTransaction(result, testInfo, { env = process.env } = {}) {
  if (!env.CONVEYANCE_TRANSACTION_PATH && !env.CONVEYANCE_RUN_ID) return null;
  const path = handoffPath(env);
  const context = identity(testInfo, env);
  if (!context.project) throw new Error('Transaction handoff requires the Playwright project identity.');
  if ((result?.appType && result.appType !== context.appType)
    || (result?.perType && result.perType !== context.perType)
    || (context.requestedEndorsement && result?.endorsementCode !== context.requestedEndorsement)) {
    throw new Error('Confirmed application does not match the requested application, permit or endorsement.');
  }
  const record = {
    version: 2, ...context,
    transactionNumber: normalizeTransactionNumber(result?.transactionNumber),
    entityName: String(result?.entityName || ''),
    conveyanceType: String(result?.conveyanceType || result?.typeName || ''),
    endorsementCode: String(result?.endorsementCode || ''),
    existingBuildingAnswer: String(result?.existingBuildingAnswer || ''),
    capturedAt: new Date().toISOString(),
    ...(context.appType === 'CV' && {
      conveyanceNumber: normalizeConveyanceNumber(result?.conveyanceNumber),
      ...(result?.installationTransactionNumber && {
        installationTransactionNumber: normalizeTransactionNumber(result.installationTransactionNumber),
      }),
    }),
  };
  mkdirSync(dirname(path), { recursive: true });
  // Exclusive creation prevents repeat/parallel workers from replacing a sibling's result.
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

/** Load only the transaction produced by Apply in this flow. */
export function loadApprovalTransaction(testInfo, { env = process.env } = {}) {
  const path = handoffPath(env);
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`No valid transaction captured by this 02 flow at ${path}: ${error.message}`); }
  const expected = identity(testInfo, env);
  if (record.version !== 2 || Object.entries(expected).some(([key, value]) => record[key] !== value)) {
    throw new Error('Transaction handoff does not match this run, application, permit, endorsement, URL, project, or repeat; approval refused.');
  }
  if (expected.appType === 'CV') normalizeConveyanceNumber(record.conveyanceNumber);
  return { ...record, transactionNumber: normalizeTransactionNumber(record.transactionNumber), source: 'current-run' };
}

function approvedInstallationPath(env) {
  const path = env.CONVEYANCE_APPROVED_INSTALLATION_PATH;
  if (!path || !isAbsolute(path) || !env.CONVEYANCE_RUN_ID) {
    throw new Error('Full CV E2E requires an approved installation handoff from the current run.');
  }
  return path;
}

export function saveApprovedInstallation(transaction, conveyanceNumber, testInfo, { env = process.env } = {}) {
  const context = identity(testInfo, env);
  if (!isVarianceInstallationType(context.appType, env) || transaction.source !== 'current-run'
    || Object.entries(context).some(([key, value]) => transaction[key] !== value)) {
    throw new Error('CV requires an approved installation from this run, not a standalone or unrelated transaction.');
  }
  const path = approvedInstallationPath(env);
  const record = {
    ...context,
    transactionNumber: normalizeTransactionNumber(transaction.transactionNumber),
    conveyanceNumber: normalizeConveyanceNumber(conveyanceNumber),
  };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

function isVarianceInstallationType(appType, env) {
  const plannedType = env.CONVEYANCE_VARIANCE_INSTALLATION_APP_TYPE;
  return VARIANCE_INSTALLATION_APP_TYPES.includes(appType) && (!plannedType || appType === plannedType);
}

export function loadVarianceConveyance(testInfo, { env = process.env } = {}) {
  if (env.CONVEYANCE_EXISTING_CONVEYANCE_NUMBER) {
    const { appType, runId } = identity(testInfo, env);
    if (appType !== 'CV' || !runId || env.CONVEYANCE_LOGIN_SOURCE !== 'existing-applicant') {
      throw new Error('An existing conveyance number requires a variance run with an existing applicant.');
    }
    return { conveyanceNumber: normalizeConveyanceNumber(env.CONVEYANCE_EXISTING_CONVEYANCE_NUMBER) };
  }
  const path = approvedInstallationPath(env);
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`No approved installation handoff for this CV run: ${error.message}`); }
  const { runId, baseUrl, project, repeatIndex, testRepeatIndex, appType } = identity(testInfo, env);
  const expected = { runId, baseUrl, project, repeatIndex, testRepeatIndex };
  if (appType !== 'CV' || !project || !isVarianceInstallationType(record.appType, env)
    || Object.entries(expected).some(([key, value]) => record[key] !== value)) {
    throw new Error('The approved installation handoff does not belong to this CV run.');
  }
  return {
    conveyanceNumber: normalizeConveyanceNumber(record.conveyanceNumber),
    installationTransactionNumber: normalizeTransactionNumber(record.transactionNumber),
  };
}
