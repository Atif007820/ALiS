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
 *   npm run test --env=PREPROD,TEST,PROD --licenseType=RESIDENTIAL --parallel=3
 *   npm run test --env=TEST --licenseType=RESIDENTIAL,COMMERCIAL --parallel=2
 *   npm run test --env=ALL --licenseType=ALL --parallel=6
 *
 * Combinations may run in parallel, but every combination remains serial:
 * 01_RegisterUser -> 02_LoginApply.
 */

import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  endorsementCodesForLicense,
  resolveEndorsementSelection,
} from '../config/constants.js';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanScript = resolve(projectRoot, 'scripts', 'clean-results.mjs');
const canonicalUserDataPath = resolve(projectRoot, 'testData', 'userData.json');
const matrixUserDataRoot = resolve(projectRoot, 'testData', 'by-environment');
const blobReportDir = resolve(projectRoot, 'test-results', '.blob-reports');
const matrixArtifactRoot = resolve(projectRoot, 'test-results', 'matrix');
const runSettingsPath = resolve(projectRoot, 'config', 'runSettings.json');

const DEFAULT_ENVIRONMENTS = ['TEST', 'PROD', 'PREPROD'];
const DEFAULT_LICENSE_TYPES = ['RESIDENTIAL', 'COMMERCIAL'];
const SERIAL_FLOW_SPECS = [
  'testScripts/01_RegisterUser.spec.js',
  'testScripts/02_LoginApply.spec.js',
];

const runSettings = loadRunSettings();
const parsed = parseCommandLine(expandConcatenatedOptions(process.argv.slice(2)));

const combinedNpmOptions = splitCombinedEnvironmentOption(
  valueFromNpmConfig('env', 'environment', 'environments'),
);
const npmEnvValue = combinedNpmOptions.environment;
const environments = parseEnvValues(joinConfigAndLooseValue(npmEnvValue, parsed.rawEnvValue, parseEnvValues))
  ?? parseEnvValues(parsed.rawEnvValue)
  ?? parseEnvValues(npmEnvValue)
  ?? null;

const npmLicenseTypeValue = valueFromNpmConfig('licensetype', 'license_type')
  ?? combinedNpmOptions.licenseType;
const licenseTypes = parseLicenseTypeValues(
  joinConfigAndLooseValue(npmLicenseTypeValue, parsed.rawLicenseTypeValue, parseLicenseTypeValues),
)
  ?? parseLicenseTypeValues(parsed.rawLicenseTypeValue)
  ?? parseLicenseTypeValues(npmLicenseTypeValue)
  ?? null;

const residentialSelection = resolveConfiguredEndorsement(
  'RESIDENTIAL',
  parsed.rawResTypeValue,
  valueFromNpmConfig('restype', 'res_type'),
  runSettings.resType,
);
const commercialSelection = resolveConfiguredEndorsement(
  'COMMERCIAL',
  parsed.rawCommTypeValue,
  valueFromNpmConfig('commtype', 'comm_type'),
  runSettings.commType,
);

const selectedSpecs = orderSelectedSpecs(resolveSelectedSpecs(parsed.selectedSpecs));

let playwrightArgs = [...parsed.playwrightArgs];
playwrightArgs = applyNpmConfigPlaywrightOptions(playwrightArgs);
playwrightArgs = applyDefaultProject(playwrightArgs);
playwrightArgs = applyWorkerOption(playwrightArgs);

const listOnly = playwrightArgs.includes('--list');
const runTargets = buildRunTargets(
  environments,
  licenseTypes,
  residentialSelection,
  commercialSelection,
);
const parallelRuns = resolveParallelRuns(parsed.parallelRuns, runTargets.length, playwrightArgs);

const envDisplay = runTargets.map(({ environment }) => environment).filter((value, index, values) => values.indexOf(value) === index).join(', ');
const licenseDisplay = runTargets.map(({ licenseType }) => licenseType).filter((value, index, values) => values.indexOf(value) === index).join(', ');
console.log(`Running Playwright against environment(s): ${envDisplay}`);
console.log(`License type(s): ${licenseDisplay}`);
console.log(formatEndorsementOverride('Residential', residentialSelection));
console.log(formatEndorsementOverride('Commercial', commercialSelection));
console.log(`Selected spec(s): ${selectedSpecs.join(' -> ')}`);
console.log(`Combination(s): ${runTargets.length}; parallel combination limit: ${parallelRuns}`);

if (!listOnly) {
  stopExistingHtmlReportServers();
  console.log('Cleaning previous results...');
  const cleanResult = spawnSync(process.execPath, [cleanScript], {
    env: { ...process.env },
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (cleanResult.status !== 0) {
    process.exit(cleanResult.status ?? 1);
  }

  mkdirSync(blobReportDir, { recursive: true });
  mkdirSync(matrixArtifactRoot, { recursive: true });
}

const results = await runWithConcurrency(runTargets, parallelRuns, runTarget);
const failedRuns = results.filter(({ passed }) => !passed);

if (!listOnly) {
  const merged = mergeHtmlReports();
  if (merged) openHtmlReport();
  else failedRuns.push({ label: 'Report merge' });
}

if (failedRuns.length > 0) {
  console.error(`Conv_E2E failed run(s): ${failedRuns.map(({ label }) => label).join(', ')}`);
  process.exit(1);
}

process.exit(0);

async function runTarget(target, targetIndex) {
  const { environment, licenseType, label, slug } = target;
  const combinationUserDataPath = resolve(matrixUserDataRoot, environment, licenseType, 'userData.json');
  const includesRegistration = selectedSpecs.includes(SERIAL_FLOW_SPECS[0]);
  const resultEnv = {
    ...process.env,
    ENVIRONMENT: environment,
    LICENSE_TYPE: licenseType,
    RES_TYPE: residentialSelection?.code ?? '',
    COMM_TYPE: commercialSelection?.code ?? '',
    USER_DATA_PATH: resolveUserDataPath(combinationUserDataPath, includesRegistration),
  };

  console.log('\n============================================================');
  console.log(`Starting Conv_E2E run: ${label}`);
  console.log('============================================================\n');

  if (!listOnly && includesRegistration) {
    rmSync(combinationUserDataPath, { force: true });
  }

  for (let specIndex = 0; specIndex < selectedSpecs.length; specIndex += 1) {
    const spec = selectedSpecs[specIndex];
    const result = await runPlaywrightSpec({
      target,
      targetIndex,
      spec,
      specIndex,
      env: resultEnv,
      playwrightArgs,
    });

    if (result.status !== 0) {
      console.error(`Conv_E2E run failed for ${label} in ${basename(spec)}.`);
      return { ...target, passed: false };
    }

    if (!listOnly && spec === SERIAL_FLOW_SPECS[0] && existsSync(combinationUserDataPath)) {
      mkdirSync(dirname(canonicalUserDataPath), { recursive: true });
      copyFileSync(combinationUserDataPath, canonicalUserDataPath);
    }
  }

  console.log(`Completed Conv_E2E run: ${label}`);
  return { ...target, passed: true };
}

function runPlaywrightSpec({ target, targetIndex, spec, specIndex, env, playwrightArgs: args }) {
  const artifactDir = resolve(matrixArtifactRoot, target.slug, specName(spec));
  const reportFile = resolve(blobReportDir, `${String(targetIndex + 1).padStart(2, '0')}-${target.slug}-${specIndex + 1}.zip`);
  let commandArgs = removeOption(removeOption(args, '--reporter'), '--output');

  commandArgs = [
    playwrightCli,
    'test',
    ...commandArgs,
    `--reporter=${listOnly ? 'line' : 'blob,line'}`,
    `--output=${artifactDir}`,
    spec,
  ];

  console.log(`Running ${basename(spec)} for ${target.label}`);

  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, commandArgs, {
      env: {
        ...env,
        PLAYWRIGHT_BLOB_OUTPUT_FILE: reportFile,
      },
      cwd: projectRoot,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      console.error(`Could not start Playwright for ${target.label}: ${error.message}`);
      resolveRun({ status: 1 });
    });
    child.once('close', (status) => resolveRun({ status: status ?? 1 }));
  });
}

function mergeHtmlReports() {
  const reportDir = resolve(projectRoot, 'playwright-report');
  const reportIndex = resolve(reportDir, 'index.html');
  if (!existsSync(blobReportDir)) {
    console.warn(`No blob reports were found: ${blobReportDir}`);
    return false;
  }

  console.log('\nMerging all environment/license results into one Playwright report...');
  const result = spawnSync(process.execPath, [
    playwrightCli,
    'merge-reports',
    '--reporter=html,list',
    blobReportDir,
  ], {
    env: {
      ...process.env,
      PLAYWRIGHT_HTML_OPEN: 'never',
      PLAYWRIGHT_HTML_OUTPUT_DIR: reportDir,
    },
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0 || !existsSync(reportIndex)) {
    console.error('Could not merge the Playwright reports.');
    return false;
  }

  return true;
}

function buildRunTargets(
  environmentOverrides,
  licenseTypeOverrides,
  configuredResidentialSelection,
  configuredCommercialSelection,
) {
  const selectedEnvironments = environmentOverrides
    ?? parseEnvValues(runSettings.environment)
    ?? ['TEST'];
  const selectedLicenseTypes = licenseTypeOverrides
    ?? parseLicenseTypeValues(runSettings.licenseType)
    ?? ['RESIDENTIAL'];

  return selectedEnvironments.flatMap((environment) => selectedLicenseTypes.map((licenseType) => {
    const endorsement = licenseType === 'RESIDENTIAL'
      ? configuredResidentialSelection
      : configuredCommercialSelection;
    const endorsementSuffix = endorsement ? ` / ${endorsement.code}` : ' / RANDOM';

    return {
      environment,
      licenseType,
      endorsement,
      label: `${environment} / ${licenseType}${endorsementSuffix}`,
      slug: `${environment}-${licenseType}-${endorsement?.code ?? 'random'}`.toLowerCase(),
    };
  }));
}

function resolveConfiguredEndorsement(licenseType, ...values) {
  const rawValue = values.find((value) => (
    value !== undefined
    && value !== null
    && String(value).trim()
    && String(value).trim().toLowerCase() !== 'true'
  ));
  if (!rawValue) return null;

  const selection = resolveEndorsementSelection(licenseType, rawValue);
  if (selection) return selection;

  const optionName = licenseType === 'RESIDENTIAL' ? 'ResType' : 'CommType';
  console.error(
    `Configuration error: Unsupported ${optionName} "${rawValue}". ` +
    `Supported ${licenseType} codes: ${endorsementCodesForLicense(licenseType).join(', ')}.`,
  );
  process.exit(1);
}

function formatEndorsementOverride(label, selection) {
  return selection
    ? `${label} endorsement override: ${selection.code} -> ${selection.conveyanceType}`
    : `${label} endorsement override: RANDOM`;
}

function resolveParallelRuns(parsedValue, targetCount, args) {
  if (args.includes('--debug')) return 1;

  const npmValue = valueFromNpmConfig('parallel');
  const requestedValue = parsedValue
    ?? (npmValue && !isTrue(npmValue) ? npmValue : null)
    ?? '1';
  const requested = parsePositiveInt(requestedValue, 1);
  return Math.max(1, Math.min(requested, targetCount));
}

async function runWithConcurrency(items, limit, action) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = await action(items[currentIndex], currentIndex);
      } catch (error) {
        console.error(`Unexpected failure in ${items[currentIndex].label}: ${error.message}`);
        results[currentIndex] = { ...items[currentIndex], passed: false };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function resolveUserDataPath(combinationPath, includesRegistration) {
  if (includesRegistration || existsSync(combinationPath)) return combinationPath;
  if (existsSync(canonicalUserDataPath)) return canonicalUserDataPath;
  return combinationPath;
}

function specName(spec) {
  return basename(spec).replace(/\.spec\.[cm]?[jt]s$/i, '');
}

function removeOption(args, optionName) {
  const nextArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === optionName) {
      index += 1;
      continue;
    }
    if (arg.startsWith(`${optionName}=`)) continue;
    nextArgs.push(arg);
  }

  return nextArgs;
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

function orderSelectedSpecs(specs) {
  const selected = unique(specs);
  const frameworkSpecs = SERIAL_FLOW_SPECS.filter((spec) => selected.includes(spec));
  const customSpecs = selected.filter((spec) => !SERIAL_FLOW_SPECS.includes(spec));
  return [...frameworkSpecs, ...customSpecs];
}

function expandConcatenatedOptions(args) {
  return args.flatMap((arg) => {
    const match = arg.match(/^(--(?:env|environment|environments)=)(.*?)(--(?:licenseType|license-type))(?:=(.*))?$/i);
    if (!match) return [arg];

    const expanded = [`${match[1]}${match[2]}`, match[3]];
    if (match[4]) expanded[1] = `${match[3]}=${match[4]}`;
    return expanded;
  });
}

function splitCombinedEnvironmentOption(value) {
  const rawValue = String(value || '');
  const match = rawValue.match(/^(.*?)(?:--licenseType|--license-type)(?:=(.*))?$/i);
  if (!match) return { environment: value, licenseType: null };

  return {
    environment: match[1],
    licenseType: match[2] || null,
  };
}

function parseCommandLine(args) {
  const result = {
    rawEnvValue: null,
    rawLicenseTypeValue: null,
    rawResTypeValue: null,
    rawCommTypeValue: null,
    selectedSpecs: [],
    playwrightArgs: [],
    parallelRuns: null,
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

    if (['--restype', '--res-type'].includes(arg.toLowerCase())) {
      result.rawResTypeValue = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (/^--(?:restype|res-type)=/i.test(arg)) {
      result.rawResTypeValue = valueAfterEquals(arg);
      continue;
    }

    if (['--commtype', '--comm-type'].includes(arg.toLowerCase())) {
      result.rawCommTypeValue = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (/^--(?:commtype|comm-type)=/i.test(arg)) {
      result.rawCommTypeValue = valueAfterEquals(arg);
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
      result.parallelRuns = next && !next.startsWith('-') ? next : defaultParallelWorkers();
      if (next && !next.startsWith('-')) index += 1;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      result.parallelRuns = valueAfterEquals(arg) || defaultParallelWorkers();
      continue;
    }
    if (arg === '--serial') {
      result.parallelRuns = '1';
      continue;
    }

    if (!result.parallelRuns && process.env.npm_config_parallel && /^\d+$/.test(arg)) {
      result.parallelRuns = arg;
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
      if (parseLicenseTypeValues(read.value)) {
        result.rawLicenseTypeValue = read.value;
        index = read.index;
        continue;
      }
    }

    if (!result.rawResTypeValue && npmBooleanOption('restype', 'res_type')) {
      result.rawResTypeValue = arg;
      continue;
    }

    if (!result.rawCommTypeValue && npmBooleanOption('commtype', 'comm_type')) {
      result.rawCommTypeValue = arg;
      continue;
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
      : parseLicenseTypeValues(joined) !== null;

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
    .toUpperCase()
    .replace(/[-_\s]+/g, '');
}

function parseEnvValues(value) {
  if (!value || String(value).toLowerCase() === 'true') return null;

  const candidates = String(value)
    .split(',')
    .map((part) => normalizeEnvironment(part))
    .filter(Boolean);

  if (candidates.length === 0) return null;
  if (candidates.includes('ALL')) return DEFAULT_ENVIRONMENTS;
  if (!candidates.every((candidate) => DEFAULT_ENVIRONMENTS.includes(candidate))) return null;
  return unique(candidates);
}

function parseLicenseTypeValues(value) {
  if (!value || String(value).toLowerCase() === 'true') return null;

  const candidates = String(value)
    .split(',')
    .map((part) => normalizeLicenseType(part))
    .filter(Boolean);

  if (candidates.length === 0) return null;
  if (candidates.includes('ALL')) return DEFAULT_LICENSE_TYPES;
  if (!candidates.every((candidate) => DEFAULT_LICENSE_TYPES.includes(candidate))) return null;
  return unique(candidates);
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

function applyWorkerOption(args) {
  if (hasOption(args, '--workers')) return args;
  return ['--workers=1', ...args];
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

function npmBooleanOption(...names) {
  return isTrue(valueFromNpmConfig(...names));
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
