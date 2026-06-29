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
import { STANDALONE_LOGIN_CREDENTIALS } from '../config/script2LoginCredentials.js';
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

/**
 * Load credentials for 02_LoginApply.spec.js.
 * Uses config/script2LoginCredentials.js when loginName/password are provided;
 * otherwise falls back to the latest registered user in testData/userData.json.
 *
 * @returns {Promise<object>} User data containing at least loginName and password.
 */
export async function loadLoginApplyUserData() {
  const configuredLoginName = process.env.LOGIN_NAME || STANDALONE_LOGIN_CREDENTIALS.loginName;
  const configuredPassword = process.env.LOGIN_PASSWORD || STANDALONE_LOGIN_CREDENTIALS.password;
  const hasConfiguredLoginName = Boolean(String(configuredLoginName || '').trim());
  const hasConfiguredPassword = Boolean(String(configuredPassword || '').trim());

  if (hasConfiguredLoginName && hasConfiguredPassword) {
    logger.info('Using standalone login credentials from config/script2LoginCredentials.js or environment.');
    return {
      loginName: String(configuredLoginName).trim(),
      password: String(configuredPassword).trim(),
    };
  }

  const savedUserData = await loadUserData();
  if (hasConfiguredLoginName || hasConfiguredPassword) {
    logger.info('Using partial standalone credentials plus latest saved user data.');
    return {
      ...savedUserData,
      ...(hasConfiguredLoginName ? { loginName: String(configuredLoginName).trim() } : {}),
      ...(hasConfiguredPassword ? { password: String(configuredPassword).trim() } : {}),
    };
  }

  logger.info('Using latest saved user credentials from testData/userData.json.');
  return savedUserData;
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
