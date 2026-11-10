import fs from 'node:fs';
import path from 'node:path';
import { URLS } from '../config/urls.js';

export function normalizeTransactionNumber(value) {
  const transactionNumber = String(value ?? '').trim();
  if (!/^\d+$/.test(transactionNumber)) {
    throw new Error('HMB transaction number must contain digits only. Set TransactionNumber for standalone approval.');
  }
  return transactionNumber;
}

function identity(testInfo, env) {
  return {
    runId: env.HMB_FLOW_RUN_ID || '',
    project: testInfo?.project?.name || '',
    repeatIndex: Number(env.HMB_FLOW_REPEAT ?? testInfo?.repeatEachIndex ?? 0),
    baseUrl: URLS.loginUrl,
  };
}

export function saveApplicationTransaction(result, user, testInfo, { env = process.env } = {}) {
  if (env.HMB_TRANSACTION_SOURCE !== 'current-run') return null;
  if (result?.submitted !== true) {
    throw new Error('Script 02 did not confirm that the HMB application was submitted; approval handoff refused.');
  }
  const filePath = env.HMB_TRANSACTION_PATH;
  if (!filePath || !path.isAbsolute(filePath) || !env.HMB_FLOW_RUN_ID) {
    throw new Error('HMB current-run approval requires a unique absolute transaction handoff path from scripts/run-hmb.mjs.');
  }
  const context = identity(testInfo, env);
  if (!context.project) throw new Error('HMB transaction handoff requires the Playwright project identity.');

  const record = {
    version: 1,
    ...context,
    transactionNumber: normalizeTransactionNumber(result?.transactionNumber),
    entityName: String(user?.entityName || ''),
    legalName: String(result?.legalName || user?.entityName || ''),
    dbaName: String(result?.dbaName || user?.dbaName || ''),
    submitted: true,
    capturedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}

export function loadApprovalTransaction(testInfo, { env = process.env, standaloneTransactionNumber = '' } = {}) {
  if (env.HMB_TRANSACTION_SOURCE !== 'current-run') {
    return {
      ...identity(testInfo, env),
      transactionNumber: normalizeTransactionNumber(env.HMB_TRANSACTION_NUMBER || standaloneTransactionNumber),
      source: 'standalone',
    };
  }

  const filePath = env.HMB_TRANSACTION_PATH;
  if (!filePath || !path.isAbsolute(filePath) || !env.HMB_FLOW_RUN_ID) {
    throw new Error('HMB current-run approval requires its unique transaction handoff path and run ID.');
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Script 02 did not save a valid HMB transaction for this run: ${error.message}`);
  }
  const expected = identity(testInfo, env);
  if (record.version !== 1 || record.submitted !== true
    || Object.entries(expected).some(([key, value]) => record[key] !== value)) {
    throw new Error('HMB transaction handoff is stale or belongs to a different run, project, repeat, or URL. Approval refused.');
  }
  return { ...record, transactionNumber: normalizeTransactionNumber(record.transactionNumber), source: 'current-run' };
}
