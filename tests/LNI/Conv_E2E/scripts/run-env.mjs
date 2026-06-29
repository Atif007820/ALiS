#!/usr/bin/env node
/**
 * Environment wrapper for the Conv_E2E Playwright framework.
 *
 * Supported examples:
 *   npm run test --env=TEST --headed --project=chromium --repeat-each=2
 *   npm run test --env=PROD --project=chromium --repeat-each=2
 *   npm run test --env=PREPROD --headed --licenseType=COMMERCIAL
 *   npm run test --env PREPROD --headed --licenseType COMMERCIAL
 *   npm run test --env=PRE PROD --headed --licenseType=COMMERCIAL --parallel 3
 *   npm run test --env=PRE PROD --headed --licenseType RESIDENTIAL --parallel=3
 *
 * Default "test" behavior is serial: 01_RegisterUser -> 02_LoginApply.
 */

import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, readFileSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanScript = resolve(projectRoot, 'scripts', 'clean-results.mjs');
const userDataPath = resolve(projectRoot, 'testData', 'userData.json');
const runSettingsPath = resolve(projectRoot, 'config', 'runSettings.json');

const DEFAULT_ENVIRONMENTS = ['TEST', 'PROD', 'PREPROD'];
const SERIAL_FLOW_SPECS = [
  'testScripts/01_RegisterUser.spec.js',
  'testScripts/02_LoginApply.spec.js',
];

const runSettings = loadRunSettings();
const parsed = parseCommandLine(process.argv.slice(2));

const npmEnvValue = valueFromNpmConfig('env', 'environment', 'environments');
const environments = parseEnvValues(joinConfigAndLooseValue(npmEnvValue, parsed.rawEnvValue, parseEnvValues))
  ?? parseEnvValues(parsed.rawEnvValue)
  ?? parseEnvValues(npmEnvValue)
  ?? null;

const licenseType = parseLicenseTypeValue(parsed.rawLicenseTypeValue)
  ?? parseLicenseTypeValue(valueFromNpmConfig('licensetype', 'license_type'))
  ?? null;

const selectedSpecs = resolveSelectedSpecs(parsed.selectedSpecs);

let playwrightArgs = [...parsed.playwrightArgs];
playwrightArgs = applyNpmConfigPlaywrightOptions(playwrightArgs);
playwrightArgs = applyDefaultProject(playwrightArgs);
playwrightArgs = applyWorkerOption(playwrightArgs, parsed.parallelWorkers);

const listOnly = playwrightArgs.includes('--list');

const envDisplay = environments?.join(' -> ') ?? 'runSettings.json default';
console.log(`Running Playwright against environment(s): ${envDisplay}`);
console.log(`Selected spec(s): ${selectedSpecs.join(' -> ')}`);
if (licenseType) {
  console.log(`Using license type override: ${licenseType}`);
}

console.log('Cleaning previous results...');
const cleanResult = spawnSync(process.execPath, [cleanScript], {
  env: { ...process.env },
  cwd: projectRoot,
  stdio: 'inherit',
});

if (cleanResult.status !== 0) {
  process.exit(cleanResult.status ?? 1);
}

const runTargets = environments ?? [null];
const failedRuns = [];

for (const environment of runTargets) {
  const resultEnv = {
    ...process.env,
  };

  if (environment) {
    resultEnv.ENVIRONMENT = environment;
  }
  if (licenseType) {
    resultEnv.LICENSE_TYPE = licenseType;
  }

  const currentEnvDisplay = environment ?? 'runSettings.json default';
  console.log('\n============================================================');
  console.log(`Starting Conv_E2E run: ${currentEnvDisplay}`);
  console.log('============================================================\n');

  if (!listOnly && selectedSpecs.includes(SERIAL_FLOW_SPECS[0]) && existsSync(userDataPath)) {
    rmSync(userDataPath, { force: true });
    console.log(`Removed stale user data before ${currentEnvDisplay}: ${userDataPath}`);
  }

  const result = runPlaywrightSpecs({
    environment: currentEnvDisplay,
    env: resultEnv,
    specs: selectedSpecs,
    playwrightArgs,
  });

  if (result.status !== 0) {
    failedRuns.push(currentEnvDisplay);
    console.error(`Conv_E2E run failed for ${currentEnvDisplay}.`);
  }
}

if (!listOnly) {
  openHtmlReport();
}

if (failedRuns.length > 0) {
  console.error(`Conv_E2E failed run(s): ${failedRuns.join(', ')}`);
  process.exit(1);
}

process.exit(0);

function runPlaywrightSpecs({ environment, env, specs, playwrightArgs: args }) {
  console.log(`\nRunning ${specs.join(' -> ')} for ${environment}`);
  return spawnSync(process.execPath, [playwrightCli, 'test', ...args, ...specs], {
    env,
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

function openHtmlReport() {
  const reportDir = resolve(projectRoot, 'playwright-report');
  const reportHost = '127.0.0.1';
  const reportPort = '9324';
  const reportUrl = `http://${reportHost}:${reportPort}`;

  if (!existsSync(reportDir)) {
    console.warn(`Playwright HTML report was not found: ${reportDir}`);
    return;
  }

  stopExistingHtmlReportServers();

  console.log(`Opening Playwright HTML report: ${reportUrl}`);
  const reportServer = spawn(process.execPath, [
    playwrightCli,
    'show-report',
    reportDir,
    '--host',
    reportHost,
    '--port',
    reportPort,
  ], {
    cwd: projectRoot,
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
  });
  reportServer.unref();
}

function stopExistingHtmlReportServers() {
  spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    [
      '$rootPattern = [Regex]::Escape($env:CONV_E2E_ROOT);',
      'Get-CimInstance Win32_Process |',
      "Where-Object { $_.CommandLine -match 'show-report' -and $_.CommandLine -match $rootPattern } |",
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' '),
  ], {
    env: {
      ...process.env,
      CONV_E2E_ROOT: projectRoot,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function resolveSelectedSpecs(parsedSpecs) {
  if (parsedSpecs.length > 0) return unique(parsedSpecs);

  const configuredSpec = valueFromNpmConfig('script', 'spec');
  if (configuredSpec) {
    const specs = [];
    addSpecAlias(specs, configuredSpec);
    if (specs.length > 0) return unique(specs);
  }

  return SERIAL_FLOW_SPECS;
}

function parseCommandLine(args) {
  const result = {
    rawEnvValue: null,
    rawLicenseTypeValue: null,
    selectedSpecs: [],
    playwrightArgs: [],
    parallelWorkers: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;

    if (arg === '--env' || arg === '--environment' || arg === '--environments') {
      const read = readJoinedValue(args, index, 'env');
      result.rawEnvValue = read.value;
      index = read.index;
      continue;
    }
    if (arg.startsWith('--env=') || arg.startsWith('--environment=') || arg.startsWith('--environments=')) {
      const read = readJoinedValue(args, index, 'env', valueAfterEquals(arg));
      result.rawEnvValue = read.value;
      index = read.index;
      continue;
    }

    if (arg === '--licenseType' || arg === '--license-type') {
      const read = readJoinedValue(args, index, 'licenseType');
      result.rawLicenseTypeValue = read.value;
      index = read.index;
      continue;
    }
    if (arg.startsWith('--licenseType=') || arg.startsWith('--license-type=')) {
      const read = readJoinedValue(args, index, 'licenseType', valueAfterEquals(arg));
      result.rawLicenseTypeValue = read.value;
      index = read.index;
      continue;
    }

    if (arg === '--script' || arg === '--spec') {
      const value = args[index + 1];
      addSpecAlias(result.selectedSpecs, value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--script=') || arg.startsWith('--spec=')) {
      addSpecAlias(result.selectedSpecs, valueAfterEquals(arg));
      continue;
    }

    if (arg === '--parallel') {
      const next = args[index + 1];
      result.parallelWorkers = next && !next.startsWith('-') ? next : defaultParallelWorkers();
      if (next && !next.startsWith('-')) index += 1;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      result.parallelWorkers = valueAfterEquals(arg) || defaultParallelWorkers();
      continue;
    }
    if (arg === '--serial') {
      result.parallelWorkers = '1';
      continue;
    }

    if (!result.parallelWorkers && isTrue(process.env.npm_config_parallel) && /^\d+$/.test(arg)) {
      result.parallelWorkers = arg;
      continue;
    }

    if (!result.rawEnvValue) {
      const read = readJoinedValue(args, index, 'env', arg);
      if (parseEnvValues(read.value)) {
        result.rawEnvValue = read.value;
        index = read.index;
        continue;
      }
    }

    if (!result.rawLicenseTypeValue) {
      const read = readJoinedValue(args, index, 'licenseType', arg);
      if (parseLicenseTypeValue(read.value)) {
        result.rawLicenseTypeValue = read.value;
        index = read.index;
        continue;
      }
    }

    if (addSpecAlias(result.selectedSpecs, arg)) {
      continue;
    }

    result.playwrightArgs.push(arg);
  }

  return result;
}

function readJoinedValue(args, index, type, initialValue = null) {
  let value = initialValue;
  let nextIndex = index;

  if (value === null) {
    value = args[index + 1] ?? '';
    nextIndex = index + 1;
  }

  const next = args[nextIndex + 1];
  if (next && !next.startsWith('-')) {
    const joined = `${value} ${next}`;
    const isUsefulJoin = type === 'env'
      ? parseEnvValues(joined) !== null
      : parseLicenseTypeValue(joined) !== null;

    if (isUsefulJoin) {
      value = joined;
      nextIndex += 1;
    }
  }

  return { value, index: nextIndex };
}

function joinConfigAndLooseValue(configValue, looseValue, parser) {
  if (!configValue || !looseValue) return null;

  const joined = `${configValue} ${looseValue}`;
  return parser(joined) ? joined : null;
}

function valueAfterEquals(arg) {
  return arg.split('=').slice(1).join('=');
}

function normalizeEnvironment(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-_\s]+/g, '');
}

function normalizeLicenseType(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function parseEnvValues(value) {
  if (!value || String(value).toLowerCase() === 'true') return null;

  const candidates = String(value)
    .split(',')
    .map((part) => normalizeEnvironment(part))
    .filter(Boolean);

  if (candidates.length === 0) return null;
  if (candidates.includes('ALL')) return DEFAULT_ENVIRONMENTS;

  const environments = candidates.filter((candidate) => DEFAULT_ENVIRONMENTS.includes(candidate));
  return environments.length > 0 ? unique(environments) : null;
}

function parseLicenseTypeValue(value) {
  if (!value || String(value).toLowerCase() === 'true') return null;

  const normalized = normalizeLicenseType(value);
  return ['COMMERCIAL', 'RESIDENTIAL'].includes(normalized) ? normalized : null;
}

function addSpecAlias(selectedSpecs, value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/').toLowerCase();
  if (!normalized) return false;

  if (['all', 'e2e', 'serial', 'test'].includes(normalized)) {
    selectedSpecs.push(...SERIAL_FLOW_SPECS);
    return true;
  }

  if (['register', 'registration', '01', '01_registeruser', '01_registeruser.spec.js'].includes(normalized)
    || normalized.endsWith('/01_registeruser.spec.js')) {
    selectedSpecs.push(SERIAL_FLOW_SPECS[0]);
    return true;
  }

  if (['apply', 'loginapply', 'login-apply', '02', '02_loginapply', '02_loginapply.spec.js'].includes(normalized)
    || normalized.endsWith('/02_loginapply.spec.js')) {
    selectedSpecs.push(SERIAL_FLOW_SPECS[1]);
    return true;
  }

  if (/\.(spec|test)\.[cm]?[jt]s$/i.test(value)) {
    selectedSpecs.push(value);
    return true;
  }

  return false;
}

function applyNpmConfigPlaywrightOptions(args) {
  const nextArgs = [...args];

  if (isTrue(process.env.npm_config_headed) && !nextArgs.includes('--headed')) {
    nextArgs.push('--headed');
  }

  const project = valueFromNpmConfig('project', 'browser');
  if (project && !hasOption(nextArgs, '--project')) {
    nextArgs.push(`--project=${project}`);
  }

  const repeatEach = valueFromNpmConfig('repeat_each', 'repeat-each');
  if (repeatEach && !hasOption(nextArgs, '--repeat-each')) {
    nextArgs.push(`--repeat-each=${repeatEach}`);
  }

  if (isTrue(process.env.npm_config_list) && !nextArgs.includes('--list')) {
    nextArgs.push('--list');
  }

  return nextArgs;
}

function applyDefaultProject(args) {
  if (hasOption(args, '--project')) return args;
  const defaultProject = runSettings.defaultProject || 'chromium';
  return [`--project=${defaultProject}`, ...args];
}

function applyWorkerOption(args, parsedParallelWorkers) {
  const npmParallel = valueFromNpmConfig('parallel');
  const workers = parsedParallelWorkers
    ?? (npmParallel ? (isTrue(npmParallel) ? defaultParallelWorkers() : npmParallel) : null)
    ?? '1';

  if (hasOption(args, '--workers')) return args;
  return [`--workers=${workers}`, ...args];
}

function hasOption(args, optionName) {
  return args.some((arg, index) => (
    arg === optionName
      || arg.startsWith(`${optionName}=`)
      || (index > 0 && args[index - 1] === optionName)
  ));
}

function valueFromNpmConfig(...names) {
  for (const name of names) {
    const normalized = name.replaceAll('-', '_').toLowerCase();
    const value = process.env[`npm_config_${normalized}`];
    if (value !== undefined && value !== '') return value;
  }
  return null;
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultParallelWorkers() {
  return String(runSettings.parallelWorkers ?? runSettings.workers ?? 3);
}

function unique(values) {
  return [...new Set(values)];
}

function loadRunSettings() {
  if (!existsSync(runSettingsPath)) return {};

  try {
    return JSON.parse(readFileSync(runSettingsPath, 'utf-8'));
  } catch {
    return {};
  }
}
