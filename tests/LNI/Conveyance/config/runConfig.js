import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildApplicationTargets, getFollowUpType } from './applicationTypes.js';

export const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

loadLocalEnv();
export const runSettings = loadSettings('runSettings.json');
const timeoutSettings = loadSettings('timeoutSettings.json');

function loadLocalEnv() {
  const envPath = join(FRAMEWORK_ROOT, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadApprovalCredentials({ env = process.env } = {}) {
  const loginName = env.CONVEYANCE_APPROVER_LOGIN_NAME?.trim();
  const password = env.CONVEYANCE_APPROVER_PASSWORD;
  if (loginName && password?.trim()) return { loginName, password };
  throw new Error('Approval requires CONVEYANCE_APPROVER_LOGIN_NAME and CONVEYANCE_APPROVER_PASSWORD in the Conveyance .env file or process configuration.');
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function boolFromEnvOrSettings(envName, settingName, fallback) {
  if (process.env[envName] !== undefined) {
    return boolFromEnv(envName, fallback);
  }

  const value = runSettings[settingName];
  if (value === undefined) return fallback;
  return Boolean(value);
}

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function intFromEnvOrSettings(envName, configuredValue, fallback) {
  if (process.env[envName] !== undefined) {
    return intFromEnv(envName, fallback);
  }

  const value = Number.parseInt(configuredValue ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function intFromSettings(settingName, fallback) {
  const value = Number.parseInt(runSettings[settingName] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function loadSettings(fileName) {
  const settingsPath = join(FRAMEWORK_ROOT, 'config', fileName);
  if (!existsSync(settingsPath)) return {};

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${settingsPath}: ${error.message}`);
  }
}

function rootPath(value, fallback) {
  const nextValue = value || fallback;
  return isAbsolute(nextValue) ? nextValue : join(FRAMEWORK_ROOT, nextValue);
}

export function getApplicationTarget(env = process.env) {
  const appType = env.CONVEYANCE_APP_TYPE || String(runSettings.AppType ?? '').trim() || 'NCI';
  const targets = buildApplicationTargets({
    AppType: appType,
    PerType: env.CONVEYANCE_PER_TYPE || (getFollowUpType(appType) ? 'ALL' : String(runSettings.PerType ?? '').trim() || 'Res'),
    ResType: env.CONVEYANCE_RES_TYPE ?? runSettings.ResType,
    CommType: env.CONVEYANCE_COMM_TYPE ?? runSettings.CommType,
  });
  if (targets.length !== 1) throw new Error('Use the Conveyance runner for multiple application/permit combinations.');
  return targets[0];
}

export const appConfig = {
  defaultProject: process.env.DEFAULT_PROJECT || runSettings.defaultProject || 'chromium',
  workers: intFromEnvOrSettings('WORKERS', runSettings.workers, runSettings.workers ?? 3),
  parallelWorkers: intFromEnvOrSettings('PARALLEL_WORKERS', runSettings.parallelWorkers, runSettings.parallelWorkers ?? 3),
  registrationLoginRetryLimit: intFromEnvOrSettings('REGISTRATION_LOGIN_RETRY_LIMIT', runSettings.registrationLoginRetryLimit, 8),
  documentUploadRetryLimit: intFromEnvOrSettings('DOCUMENT_UPLOAD_RETRY_LIMIT', runSettings.documentUploadRetryLimit, 3),
  fullyParallel: boolFromEnvOrSettings('FULLY_PARALLEL', 'fullyParallel', false),
  headless: boolFromEnvOrSettings('HEADLESS', 'headless', !!process.env.CI),
  slowMo: intFromSettings('slowMo', 0),
  logLevel: process.env.LOG_LEVEL || runSettings.logLevel || 'info',
  maximizeWindow: boolFromEnvOrSettings('MAXIMIZE_WINDOW', 'maximizeWindow', false),
  viewport: runSettings.viewport === null
    ? null
    : {
        width: intFromEnv('VIEWPORT_WIDTH', runSettings.viewport?.width ?? 1440),
        height: intFromEnv('VIEWPORT_HEIGHT', runSettings.viewport?.height ?? 900),
      },
  timeouts: {
    test: intFromEnvOrSettings('TEST_TIMEOUT_MS', timeoutSettings.testTimeoutMs, 10 * 60 * 1000),
    expect: intFromEnvOrSettings('EXPECT_TIMEOUT_MS', timeoutSettings.expectTimeoutMs, 100 * 1000),
    workQueueSearch: intFromEnvOrSettings('WORK_QUEUE_SEARCH_TIMEOUT_MS', timeoutSettings.workQueueSearchTimeoutMs, 150 * 1000),
    action: intFromEnvOrSettings('ACTION_TIMEOUT_MS', timeoutSettings.actionTimeoutMs, 30 * 1000),
    navigation: intFromEnvOrSettings('NAVIGATION_TIMEOUT_MS', timeoutSettings.navigationTimeoutMs, 150 * 1000),
    slowField: intFromEnvOrSettings('SLOW_FIELD_TIMEOUT_MS', timeoutSettings.slowFieldTimeoutMs, 30 * 1000),
    documentUploadResult: intFromEnvOrSettings(
      'DOCUMENT_UPLOAD_RESULT_TIMEOUT_MS',
      timeoutSettings.documentUploadResultTimeoutMs,
      90 * 1000,
    ),
  },
};

export const USER_DATA_PATH = rootPath(process.env.USER_DATA_PATH, 'testData/userData.json');
export const UPLOAD_FILES_DIR = rootPath(process.env.UPLOAD_FILES_DIR, 'UploadFiles');
