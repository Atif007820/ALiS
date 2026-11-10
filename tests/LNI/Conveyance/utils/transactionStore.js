import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { appConfig } from '../config/runConfig.js';
import { BASE_URL } from '../config/URL.js';

export function normalizeTransactionNumber(value) {
  const transactionNumber = String(value ?? '').trim();
  if (!/^\d+$/.test(transactionNumber)) {
    throw new Error('The Conveyance transaction number must contain digits only.');
  }
  return transactionNumber;
}

function identity(testInfo, env) {
  return {
    runId: env.CONVEYANCE_RUN_ID || '',
    environment: env.ENVIRONMENT || appConfig.environment,
    licenseType: env.LICENSE_TYPE || appConfig.licenseType,
    baseUrl: env.BASE_URL || BASE_URL,
    project: testInfo?.project?.name || '',
    repeatIndex: Number(env.CONVEYANCE_FLOW_REPEAT ?? testInfo?.repeatEachIndex ?? 0),
    testRepeatIndex: Number(testInfo?.repeatEachIndex ?? 0),
  };
}

function handoffPath(env) {
  const path = env.CONVEYANCE_TRANSACTION_PATH;
  if (!path || !isAbsolute(path) || !env.CONVEYANCE_RUN_ID) {
    throw new Error('Current-run approval requires an absolute transaction handoff path and fresh run ID from scripts/run-env.mjs.');
  }
  return path;
}

/** Persist only a confirmed 02 result, never credentials or a shared latest transaction. */
export function saveApplicationTransaction(result, testInfo, { env = process.env } = {}) {
  if (!env.CONVEYANCE_TRANSACTION_PATH && !env.CONVEYANCE_RUN_ID) return null;
  const path = handoffPath(env);
  const context = identity(testInfo, env);
  if (!context.project) throw new Error('Transaction handoff requires the Playwright project identity.');
  const record = {
    version: 1, ...context,
    transactionNumber: normalizeTransactionNumber(result?.transactionNumber),
    entityName: String(result?.entityName || ''),
    conveyanceType: String(result?.conveyanceType || result?.typeName || ''),
    endorsementCode: String(result?.endorsementCode || ''),
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
  if (record.version !== 1 || Object.entries(expected).some(([key, value]) => record[key] !== value)) {
    throw new Error('Transaction handoff does not match this run, environment, license, URL, project, or repeat; approval refused.');
  }
  return { ...record, transactionNumber: normalizeTransactionNumber(record.transactionNumber), source: 'current-run' };
}
