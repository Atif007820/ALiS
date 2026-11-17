/**
 * userStore.js
 *
 * Reads and writes test-user credentials to/from a JSON file on disk.
 * This allows test 01 (register) to pass its output to test 02 (login & apply)
 * without any shared in-memory state.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { USER_DATA_PATH } from '../config/runConfig.js';
import { LOGIN_CREDENTIALS } from '../config/LoginCredentials.js';
import { logger } from './logger.js';
import { sleep } from './randomData.js';

/**
 * Poll for the user-data file and return its contents once available.
 * Useful when tests run in parallel and the file may not exist yet.
 *
 * @param {{ timeoutMs?: number, pollMs?: number, filePath?: string }} [options]
 * @returns {Promise<object>} Parsed user data.
 */
export async function loadUserData({
  timeoutMs = 30000,
  pollMs    = 250,
  filePath  = USER_DATA_PATH,
} = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    await sleep(pollMs);
  }
  throw new Error(`User data file was not found within ${timeoutMs}ms: ${filePath}`);
}

export function resolveApplicantCredentials({ overrides = {}, env = process.env, configured = LOGIN_CREDENTIALS } = {}) {
  const loginName = String(overrides.loginName ?? env.LOGIN_NAME ?? configured.loginName ?? '').trim();
  const password = String(overrides.password ?? env.LOGIN_PASSWORD ?? configured.password ?? '').trim();
  if (Boolean(loginName) !== Boolean(password)) {
    throw new Error('Provide both applicant LoginName and LoginPassword, or leave both blank. You can set these in config/LoginCredentials.js or LOGIN_NAME and LOGIN_PASSWORD.');
  }
  return loginName ? { loginName, password } : null;
}

/** Standalone apply can use the latest saved account only when no explicit applicant is required. */
export async function loadLoginApplyUserData() {
  if (process.env.CONVEYANCE_LOGIN_SOURCE === 'registered') {
    logger.info('Using the account created by this E2E registration.');
    return loadUserData();
  }
  const credentials = resolveApplicantCredentials();
  if (credentials) {
    logger.info('Using the configured existing applicant account.');
    return credentials;
  }
  if (process.env.CONVEYANCE_LOGIN_SOURCE === 'existing-applicant') {
    throw new Error('This flow requires the existing applicant login name and password.');
  }

  logger.info('Using latest saved user credentials from testData/userData.json.');
  return loadUserData();
}

/**
 * Persist user credentials to disk so subsequent tests can load them.
 *
 * @param {object} userData
 * @param {string} [filePath]
 */
export function saveUserData(userData, filePath = USER_DATA_PATH) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(userData, null, 2), 'utf-8');
  logger.success(`Credentials saved → ${filePath}`);
}
