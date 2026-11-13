#!/usr/bin/env node
/**
 * Application/permit combinations may run in parallel, but each remains serial:
 * 01_RegisterUser -> 02_LoginApply -> 03_ApproveApplication.
 */

import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import playwrightConfig from '../playwright.config.js';
import { loadApprovalCredentials, TransactionNumber } from '../config/approvalTransacNumber.js';
import { normalizeTransactionNumber } from '../utils/transactionStore.js';
import { assertApprovalSelection, assertMutationRetries, expandFlowTargets, flowAxes, SERIAL_FLOW_SPECS } from './flowPlan.mjs';
import { buildApplicationTargets } from '../config/applicationTypes.js';
import { appConfig, runSettings, USER_DATA_PATH } from '../config/runConfig.js';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanScript = resolve(projectRoot, 'scripts', 'clean-results.mjs');
const blobReportDir = resolve(projectRoot, 'test-results', '.blob-reports');
const matrixArtifactRoot = resolve(projectRoot, 'test-results', 'matrix');
const selectionOptions = { apptype: 'AppType', pertype: 'PerType', restype: 'ResType', commtype: 'CommType' };
const parsed = parseCommandLine(process.argv.slice(2));
const appOverride = parsed.selection.AppType ?? valueFromNpmConfig('apptype', 'app_type');

const selectedSpecs = resolveSelectedSpecs(parsed.selectedSpecs, parsed.flowMode);
const standaloneApproval = selectedSpecs.includes(SERIAL_FLOW_SPECS[2])
  && !selectedSpecs.includes(SERIAL_FLOW_SPECS[1]);
const suppliedTransaction = parsed.rawTransactionValue
  ?? valueFromNpmConfig('transaction', 'transaction_number')
  ?? (standaloneApproval ? process.env.CONVEYANCE_TRANSACTION_NUMBER : null);
const rawTransaction = String(suppliedTransaction ?? '').trim()
  || (standaloneApproval ? String(TransactionNumber ?? '').trim() : '');
const transactionNumber = rawTransaction ? normalizeTransactionNumber(rawTransaction) : null;

let playwrightArgs = [...parsed.playwrightArgs];
playwrightArgs = applyNpmConfigPlaywrightOptions(playwrightArgs);
playwrightArgs = applyDefaultProject(playwrightArgs);
playwrightArgs = applyWorkerOption(playwrightArgs);

const listOnly = playwrightArgs.includes('--list');
let runTargets;
let parallelRuns;
try {
  const axes = flowAxes(playwrightArgs, playwrightConfig.projects.map(project => project.name));
  playwrightArgs = axes.remainingArgs;
  runTargets = expandFlowTargets(buildApplicationTargets({
    AppType: appOverride ?? runSettings.AppType ?? 'NCI',
    PerType: parsed.selection.PerType ?? valueFromNpmConfig('pertype', 'per_type')
      ?? (appOverride ? 'ALL' : runSettings.PerType ?? 'Res'),
    ResType: parsed.selection.ResType ?? valueFromNpmConfig('restype', 'res_type') ?? runSettings.ResType,
    CommType: parsed.selection.CommType ?? valueFromNpmConfig('commtype', 'comm_type') ?? runSettings.CommType,
  }), axes);
  parallelRuns = resolveParallelRuns(parsed.parallelRuns, runTargets.length, playwrightArgs);
  assertMutationRetries(selectedSpecs, playwrightArgs);
  if (!listOnly) {
    assertApprovalSelection(selectedSpecs, runTargets, transactionNumber);
    if (selectedSpecs.includes(SERIAL_FLOW_SPECS[2])) loadApprovalCredentials();
  }
} catch (error) {
  exitConfigurationError(error.message);
}

console.log(`Application / permit: ${unique(runTargets.map(target => target.selectionLabel)).join(', ')}`);
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
  if (!merged) failedRuns.push({ label: 'Report merge' });
  else if (process.env.ALIS_ECLIPSE_MANAGED_REPORT !== '1') openHtmlReport();
}

if (failedRuns.length > 0) {
  console.error(`Conveyance failed run(s): ${failedRuns.map(({ label }) => label).join(', ')}`);
  process.exit(1);
}

process.exit(0);

async function runTarget(target, targetIndex) {
  const { appType, perType, permit, endorsement, label, slug } = target;
  const includesRegistration = selectedSpecs.includes(SERIAL_FLOW_SPECS[0]);
  const includesApply = selectedSpecs.includes(SERIAL_FLOW_SPECS[1]);
  const flowDirectory = resolve(matrixArtifactRoot, slug, 'handoff', target.runId);
  const freshUserDataPath = resolve(flowDirectory, 'userData.json');
  const resultEnv = {
    ...process.env,
    CONVEYANCE_APP_TYPE: appType,
    CONVEYANCE_PER_TYPE: perType,
    CONVEYANCE_RES_TYPE: permit.override === 'ResType' ? endorsement?.code ?? '' : '',
    CONVEYANCE_COMM_TYPE: permit.override === 'CommType' ? endorsement?.code ?? '' : '',
    USER_DATA_PATH: includesRegistration ? freshUserDataPath : USER_DATA_PATH,
    CONVEYANCE_LOGIN_SOURCE: includesRegistration ? 'registered' : 'standalone',
    CONVEYANCE_RUN_ID: target.runId,
    CONVEYANCE_FLOW_REPEAT: String(target.repeatIndex),
    CONVEYANCE_TRANSACTION_PATH: resolve(flowDirectory, 'transaction.json'),
    CONVEYANCE_TRANSACTION_SOURCE: includesApply ? 'current-run' : 'explicit',
    CONVEYANCE_TRANSACTION_NUMBER: includesApply ? '' : transactionNumber || '',
    FULLY_PARALLEL: 'false',
  };

  console.log('\n============================================================');
  console.log(`Starting Conveyance run: ${label}`);
  console.log('============================================================\n');

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
      console.error(`Conveyance run failed for ${label} in ${basename(spec)}.`);
      return { ...target, passed: false };
    }

    if (!listOnly && spec === SERIAL_FLOW_SPECS[0] && existsSync(freshUserDataPath)) {
      mkdirSync(dirname(USER_DATA_PATH), { recursive: true });
      copyFileSync(freshUserDataPath, USER_DATA_PATH);
    }
  }

  console.log(`Completed Conveyance run: ${label}`);
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
    `--project=${target.project}`,
    '--repeat-each=1',
    ...([SERIAL_FLOW_SPECS[1], SERIAL_FLOW_SPECS[2]].includes(spec) ? ['--retries=0'] : []),
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
        PWTEST_BOT_NAME: target.slug,
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

  console.log('\nMerging application/permit results into one Playwright report...');
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

function resolveParallelRuns(parsedValue, targetCount, args) {
  if (args.includes('--debug')) return 1;

  const npmValue = valueFromNpmConfig('parallel');
  const requestedValue = parsedValue
    ?? (npmValue && !isTrue(npmValue) ? npmValue : null)
    ?? (isTrue(npmValue) ? appConfig.parallelWorkers : runSettings.parallel ?? 1);
  if (!/^\d+$/.test(String(requestedValue)) || !Number.isSafeInteger(Number(requestedValue)) || Number(requestedValue) < 1) {
    throw new Error('--parallel must be a positive integer.');
  }
  return Math.min(Number(requestedValue), targetCount);
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
      '$rootPattern = [Regex]::Escape($env:CONVEYANCE_ROOT);',
      'Get-CimInstance Win32_Process |',
      "Where-Object { $_.CommandLine -match 'show-report' -and $_.CommandLine -match $rootPattern } |",
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' '),
  ], {
    env: {
      ...process.env,
      CONVEYANCE_ROOT: projectRoot,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
}

function resolveSelectedSpecs(parsedSpecs, flowMode) {
  const specs = [...parsedSpecs];
  if (specs.length === 0) {
    const configuredSpec = valueFromNpmConfig('script', 'spec');
    if (configuredSpec) addRequestedSpec(specs, configuredSpec);
  }

  const ordered = orderSelectedSpecs(specs);
  if (flowMode === 'standalone' && ordered.length !== 1) {
    exitConfigurationError('npm run test requires exactly one spec, e.g. npm run test -- --spec=register, --spec=apply, or --spec=approve. Use npm run conv for the full flow.');
  }
  if (flowMode === 'e2e' && ordered.length > 0
    && (ordered.length !== SERIAL_FLOW_SPECS.length || ordered.some((spec, index) => spec !== SERIAL_FLOW_SPECS[index]))) {
    exitConfigurationError('npm run conv runs the full flow. Use npm run test -- --spec=<register|apply|approve> to run one script.');
  }

  return ordered.length ? ordered : SERIAL_FLOW_SPECS;
}

function orderSelectedSpecs(specs) {
  const selected = unique(specs);
  const frameworkSpecs = SERIAL_FLOW_SPECS.filter((spec) => selected.includes(spec));
  const customSpecs = selected.filter((spec) => !SERIAL_FLOW_SPECS.includes(spec));
  return [...frameworkSpecs, ...customSpecs];
}

function parseCommandLine(args) {
  const result = {
    flowMode: null,
    selection: {},
    rawTransactionValue: null,
    selectedSpecs: [],
    playwrightArgs: [],
    parallelRuns: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;

    if (arg === '--e2e' || arg === '--standalone') {
      const flowMode = arg.slice(2);
      if (result.flowMode && result.flowMode !== flowMode) {
        exitConfigurationError('Select either the full E2E flow or a standalone script.');
      }
      result.flowMode = flowMode;
      continue;
    }

    if (arg === '--transaction' || arg === '--transaction-number') {
      result.rawTransactionValue = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (/^--transaction(?:-number)?=/.test(arg)) {
      result.rawTransactionValue = valueAfterEquals(arg);
      continue;
    }
    if (!result.rawTransactionValue && npmBooleanOption('transaction', 'transaction_number') && /^\d+$/.test(arg)) {
      result.rawTransactionValue = arg;
      continue;
    }

    const optionMatch = arg.match(/^--(app-?type|per-?type|res-?type|comm-?type)(?:=(.*))?$/i);
    if (optionMatch) {
      const name = selectionOptions[optionMatch[1].toLowerCase().replace('-', '')];
      if (optionMatch[2] === undefined && (!args[index + 1] || args[index + 1].startsWith('--'))) {
        exitConfigurationError(`--${name} requires a value.`);
      }
      result.selection[name] = optionMatch[2] ?? args[++index];
      continue;
    }

    // Reject old or misspelled CLI options before any result cleanup or browser action.
    if (/^--(?:env(?:ironments?)?|license-?type)(?:=|$)/i.test(arg)) {
      exitConfigurationError(`${arg.split('=')[0]} is no longer supported. Select a flow with --AppType and --PerType.`);
    }

    if (arg === '--script' || arg === '--spec') {
      const value = args[index + 1];
      addRequestedSpec(result.selectedSpecs, value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--script=') || arg.startsWith('--spec=')) {
      addRequestedSpec(result.selectedSpecs, valueAfterEquals(arg));
      continue;
    }

    if (arg === '--parallel') {
      const next = args[index + 1];
      result.parallelRuns = next && !next.startsWith('-') ? next : appConfig.parallelWorkers;
      if (next && !next.startsWith('-')) index += 1;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      result.parallelRuns = valueAfterEquals(arg) || appConfig.parallelWorkers;
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

    if (addSpecAlias(result.selectedSpecs, arg)) {
      continue;
    }

    result.playwrightArgs.push(arg);
  }

  return result;
}

function valueAfterEquals(arg) {
  return arg.split('=').slice(1).join('=');
}

function exitConfigurationError(message) {
  console.error(`Configuration error: ${message}`);
  process.exit(1);
}

function addRequestedSpec(selectedSpecs, value) {
  if (!addSpecAlias(selectedSpecs, value)) {
    exitConfigurationError(`Unknown script selection: "${value ?? ''}". Use register, apply, approve, or a spec filename.`);
  }
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

  if (['approve', 'approval', '03', '03_approveapplication', '03_approveapplication.spec.js'].includes(normalized)
    || normalized.endsWith('/03_approveapplication.spec.js')) {
    selectedSpecs.push(SERIAL_FLOW_SPECS[2]);
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

  const retries = valueFromNpmConfig('retries');
  if (retries && !hasOption(nextArgs, '--retries')) nextArgs.push(`--retries=${retries}`);

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

function unique(values) {
  return [...new Set(values)];
}
