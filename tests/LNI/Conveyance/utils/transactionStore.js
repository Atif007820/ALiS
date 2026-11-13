import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { getApplicationTarget } from '../config/runConfig.js';
import { BASE_URL } from '../config/URL.js';

export function normalizeTransactionNumber(value) {
  const transactionNumber = String(value ?? '').trim();
  if (!/^\d+$/.test(transactionNumber)) {
    throw new Error('The Conveyance transaction number must contain digits only.');
  }
  return transactionNumber;
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
  };
  mkdirSync(dirname(path), { recursive: true });
  // Exclusive creation prevents repeat/parallel workers from replacing a sibling's result.
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

/** Load only the transaction produced by this flow, or an explicit standalone target. */
export function loadApprovalTransaction(testInfo, { env = process.env, standaloneTransactionNumber } = {}) {
  if (env.CONVEYANCE_TRANSACTION_SOURCE !== 'current-run') {
    return {
      ...identity(testInfo, env),
      transactionNumber: normalizeTransactionNumber(
        env.CONVEYANCE_TRANSACTION_NUMBER || standaloneTransactionNumber,
      ),
      source: 'explicit',
    };
  }
  const path = handoffPath(env);
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`No valid transaction captured by this 02 flow at ${path}: ${error.message}`); }
  const expected = identity(testInfo, env);
  if (record.version !== 2 || Object.entries(expected).some(([key, value]) => record[key] !== value)) {
    throw new Error('Transaction handoff does not match this run, application, permit, endorsement, URL, project, or repeat; approval refused.');
  }
  return { ...record, transactionNumber: normalizeTransactionNumber(record.transactionNumber), source: 'current-run' };
}
