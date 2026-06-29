import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_SETTINGS_PATH = join(FRAMEWORK_ROOT, 'config', 'runSettings.json');

loadLocalEnv();
const runSettings = loadRunSettings();

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

function normalizeEnvironment(value = 'TEST') {
  return String(value).trim().toUpperCase().replace(/[-_\s]+/g, '');
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

function intFromEnvOrSettings(envName, settingName, fallback) {
  if (process.env[envName] !== undefined) {
    return intFromEnv(envName, fallback);
  }

  const value = Number.parseInt(runSettings[settingName] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function intFromSettings(settingName, fallback) {
  const value = Number.parseInt(runSettings[settingName] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function loadRunSettings() {
  if (!existsSync(RUN_SETTINGS_PATH)) return {};

  try {
    return JSON.parse(readFileSync(RUN_SETTINGS_PATH, 'utf-8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${RUN_SETTINGS_PATH}: ${error.message}`);
  }
}

function rootPath(value, fallback) {
  const nextValue = value || fallback;
  return isAbsolute(nextValue) ? nextValue : join(FRAMEWORK_ROOT, nextValue);
}

export const environment = normalizeEnvironment(
  process.env.ENVIRONMENT || runSettings.environment || 'PRE PROD'
);

export const licenseType = (
  process.env.LICENSE_TYPE || runSettings.licenseType || 'COMMERCIAL'
).trim().toUpperCase();

export const appConfig = {
  environment,
  baseUrl: process.env.BASE_URL || '',
  licenseType,
  defaultProject: process.env.DEFAULT_PROJECT || runSettings.defaultProject || 'chromium',
  workers: intFromEnvOrSettings('WORKERS', 'workers', runSettings.workers ?? 3),
  parallelWorkers: intFromEnvOrSettings('PARALLEL_WORKERS', 'parallelWorkers', runSettings.parallelWorkers ?? 3),
  registrationLoginRetryLimit: intFromEnvOrSettings('REGISTRATION_LOGIN_RETRY_LIMIT', 'registrationLoginRetryLimit', 8),
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
    test: intFromEnvOrSettings('TEST_TIMEOUT_MS', 'testTimeoutMs', 10 * 60 * 1000),
    expect: intFromEnvOrSettings('EXPECT_TIMEOUT_MS', 'expectTimeoutMs', 100 * 1000),
    action: intFromEnvOrSettings('ACTION_TIMEOUT_MS', 'actionTimeoutMs', 30 * 1000),
    navigation: intFromEnvOrSettings('NAVIGATION_TIMEOUT_MS', 'navigationTimeoutMs', 150 * 1000),
    slowField: intFromEnvOrSettings('SLOW_FIELD_TIMEOUT_MS', 'slowFieldTimeoutMs', 30 * 1000),
  },
};

export const USER_DATA_PATH = rootPath(process.env.USER_DATA_PATH, 'testData/userData.json');
export const UPLOAD_FILES_DIR = rootPath(process.env.UPLOAD_FILES_DIR, 'UploadFiles');
