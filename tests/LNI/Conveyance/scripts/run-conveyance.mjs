#!/usr/bin/env node
/**
 * Application/permit combinations may run in parallel, but each remains serial:
 * 01_RegisterUser -> 02_LoginApply -> 03_ApproveApplication.
 */

import { spawn, spawnSync } from 'child_process';
import { randomInt } from 'node:crypto';
import { createRequire } from 'module';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import playwrightConfig from '../playwright.config.js';
import { loadApprovalCredentials, TransactionNumber } from '../config/approvalTransacNumber.js';
import { CONVEYANCE_VARIANCE_DETAILS } from '../config/ConveyanceVarianceDetails.js';
import { TEST_DATA } from '../config/editableData.js';
import { normalizeConveyanceNumber, normalizeTransactionNumber } from '../utils/transactionStore.js';
import { resolveApplicantCredentials } from '../utils/userStore.js';
import { assertApprovalSelection, assertMutationRetries, buildFlowStages, expandFlowTargets, flowAxes, SERIAL_FLOW_SPECS } from './flowPlan.mjs';
import { buildApplicationTargets, selectInstallationTargets, VARIANCE_INSTALLATION_APP_TYPES } from '../config/applicationTypes.js';
import { appConfig, runSettings, UPLOAD_FILES_DIR, USER_DATA_PATH } from '../config/runConfig.js';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanScript = resolve(projectRoot, 'scripts', 'clean-results.mjs');
const blobReportDir = resolve(projectRoot, 'test-results', '.blob-reports');
const matrixArtifactRoot = resolve(projectRoot, 'test-results', 'matrix');
const selectionOptions = { apptype: 'AppType', pertype: 'PerType', restype: 'ResType', commtype: 'CommType' };
const selectionOption = /^(--)?(app-?type|per-?type|res-?type|comm-?type)(?:=(.*))?$/i;
const selectionSeparator = /,\s*(?=(?:--)?(?:app-?type|per-?type|res-?type|comm-?type)(?:=|,|$))/i;
const inputOptions = {
  loginname: 'loginName', loginpassword: 'password', password: 'password',
  convnum: 'conveyanceNumber', transacnum: 'transactionNumber',
};
const retiredNumberOptions = new Set(['conveyancenumber', 'transacnumber', 'transaction', 'transactionnumber']);
const numberUsage = 'Use --ConvNum with var --ExistingConveyance or var --apply, or --TransacNum with --approve, after npm\'s -- separator.';
if (Object.entries(process.env).some(([key, value]) => value !== '' && /^npm_config_/i.test(key)
  && ['apply', 'register', 'regsiter', 'approve', 'existingconveyance', 'convnum', 'transacnum', ...retiredNumberOptions].includes(
    key.slice('npm_config_'.length).toLowerCase().replace(/[-_]/g, ''),
  ))) {
  exitConfigurationError('Pass workflow and number options after npm\'s -- separator. ' + numberUsage);
}
const parsed = parseCommandLine(process.argv.slice(2));
const overrides = {
  AppType: parsed.selection.AppType ?? valueFromNpmConfig('apptype', 'app_type') ?? undefined,
  PerType: parsed.selection.PerType ?? valueFromNpmConfig('pertype', 'per_type') ?? undefined,
  ResType: parsed.selection.ResType ?? valueFromNpmConfig('restype', 'res_type') ?? undefined,
  CommType: parsed.selection.CommType ?? valueFromNpmConfig('commtype', 'comm_type') ?? undefined,
};
const requestedSpecs = resolveSelectedSpecs(parsed.selectedSpecs, parsed.flowMode);
const legacyVariance = !parsed.subcommand && !parsed.register && requestedSpecs.length === SERIAL_FLOW_SPECS.length
  && /^CV$/i.test(String(overrides.AppType ?? runSettings.AppType ?? '').trim());
const flow = parsed.subcommand ?? (legacyVariance ? 'var' : null);
const loginOverrides = {
  loginName: parsed.inputs.loginName,
  password: parsed.inputs.password,
};
const hasLoginOverrides = Object.values(loginOverrides).some(value => String(value ?? '').trim());
const existingRequested = parsed.existingUser || isTrue(valueFromNpmConfig('existinguser', 'existing_user', 'existing'));
const directVariance = parsed.existingConveyance || (parsed.subcommand === 'var' && parsed.apply);
const reuseApplicant = Boolean(flow) && (parsed.apply || existingRequested || directVariance || hasLoginOverrides);

let playwrightArgs = [...parsed.playwrightArgs];
playwrightArgs = applyNpmConfigPlaywrightOptions(playwrightArgs);
playwrightArgs = applyDefaultProject(playwrightArgs);
playwrightArgs = applyWorkerOption(playwrightArgs);

const listOnly = playwrightArgs.includes('--list');
let runTargets;
let parallelRuns;
let selectedSpecs = requestedSpecs;
let applicantCredentials;
let conveyanceNumber;
let transactionNumber;
const ignoredEndorsements = [];
try {
  const hasSelection = Object.values(overrides).some(value => String(value ?? '').trim());
  if (parsed.register) {
    if (parsed.subcommand || parsed.apply || parsed.approve || directVariance || existingRequested
      || hasLoginOverrides || hasSelection || parsed.selectedSpecs.length) {
      throw new Error('--register runs by itself. Omit the flow, applicant, installation and script selection options.');
    }
    selectedSpecs = [SERIAL_FLOW_SPECS[0]];
  }
  if (parsed.apply && !parsed.subcommand) {
    throw new Error('--apply requires npm run conv initial or npm run conv var.');
  }
  if (parsed.apply && existingRequested) {
    throw new Error('Choose either --apply (submit only) or --ExistingUser (submit and approve).');
  }
  if (parsed.approve) {
    if (parsed.subcommand || parsed.existingConveyance || existingRequested || hasLoginOverrides
      || hasSelection || parsed.selectedSpecs.length || parsed.flowMode === 'standalone') {
      throw new Error('--approve runs by itself. Omit the flow, applicant, installation and script selection options.');
    }
    const value = parsed.inputs.transactionNumber ?? TransactionNumber;
    if (!String(value ?? '').trim()) throw new Error('--approve requires --TransacNum or TransactionNumber in config/approvalTransacNumber.js.');
    transactionNumber = normalizeTransactionNumber(value);
    selectedSpecs = [SERIAL_FLOW_SPECS[2]];
  } else {
    assertApprovalSelection(requestedSpecs);
    if (parsed.inputs.transactionNumber !== undefined) throw new Error('--TransacNum requires --approve.');
  }
  if (directVariance) {
    if (parsed.existingConveyance && (parsed.subcommand !== 'var' || hasSelection)) {
      throw new Error('--ExistingConveyance requires var and does not take installation type, permit or endorsement options.');
    }
    if (hasSelection) {
      throw new Error('var --apply submits a variance on an existing conveyance and does not take installation selectors. Use --ConvNum to choose the conveyance.');
    }
    const value = parsed.inputs.conveyanceNumber ?? CONVEYANCE_VARIANCE_DETAILS.conveyanceNumber;
    if (!String(value ?? '').trim()) {
      const mode = parsed.apply ? 'var --apply' : '--ExistingConveyance';
      throw new Error(`${mode} requires --ConvNum or conveyanceNumber in config/ConveyanceVarianceDetails.js.`);
    }
    conveyanceNumber = normalizeConveyanceNumber(value);
  } else if (parsed.inputs.conveyanceNumber !== undefined) {
    throw new Error('--ConvNum requires var --ExistingConveyance or var --apply.');
  }
  const standaloneApply = requestedSpecs.includes(SERIAL_FLOW_SPECS[1]) && !requestedSpecs.includes(SERIAL_FLOW_SPECS[0]);
  if (existingRequested && !flow) {
    throw new Error('--ExistingUser requires npm run conv initial or npm run conv var.');
  }
  if (reuseApplicant || standaloneApply) {
    applicantCredentials = resolveApplicantCredentials({ overrides: loginOverrides });
    if (reuseApplicant && !applicantCredentials) {
      const mode = parsed.apply ? 'Apply-only' : 'Existing-user';
      throw new Error(`${mode} mode requires an applicant login and password in config/LoginCredentials.js or LOGIN_NAME and LOGIN_PASSWORD.`);
    }
  } else if (hasLoginOverrides) {
    throw new Error('Applicant login overrides are for initial, var, or standalone apply.');
  }
  if (parsed.apply) selectedSpecs = [SERIAL_FLOW_SPECS[1]];
  else if (reuseApplicant) selectedSpecs = SERIAL_FLOW_SPECS.slice(1);

  const axes = flowAxes(playwrightArgs, playwrightConfig.projects.map(project => project.name));
  playwrightArgs = axes.remainingArgs;
  runTargets = expandFlowTargets(resolveApplicationTargets(), axes).map(target => ({
    ...target, stages: buildFlowStages(target, selectedSpecs, { reuseApplicant, existingConveyance: directVariance }),
  }));
  const allSelection = parsed.subcommand && ['AppType', 'PerType'].some(option =>
    /^ALL$/i.test(String(overrides[option] ?? runSettings[option] ?? '').trim()));
  for (const option of ['CommType', 'ResType']) {
    if (!String(overrides[option] ?? '').trim()) continue;
    if (runTargets.some(({ stages }) => stages.some(({ selection }) => selection.permit?.override === option))) continue;

    const permit = option === 'CommType' ? 'Comm' : 'Res';
    if (!allSelection) throw new Error(`--${option} requires a matching NCI ${permit} permit in this run.`);
    ignoredEndorsements.push(`Ignoring --${option}: no NCI ${permit} target in this run.`);
  }
  if ((parsed.approve || directVariance) && runTargets.length !== 1) {
    throw new Error('A run for one existing transaction or conveyance requires one browser project and one repeat.');
  }
  parallelRuns = resolveParallelRuns(parsed.parallelRuns, runTargets.length, playwrightArgs);
  assertMutationRetries(selectedSpecs, playwrightArgs);
  if (!listOnly) {
    if (selectedSpecs.includes(SERIAL_FLOW_SPECS[2])) loadApprovalCredentials();
    if (runTargets.some(target => target.stages.some(({ spec, phase }) => phase === 'variance' && spec === SERIAL_FLOW_SPECS[1]))) {
      const { fileName } = TEST_DATA.variance.document;
      if (!fileName || basename(fileName) !== fileName || !existsSync(resolve(UPLOAD_FILES_DIR, fileName))) {
        throw new Error('The configured CV document must exist in UploadFiles. Check variance.document in config/editableData.js.');
      }
    }
  }
} catch (error) {
  exitConfigurationError(error.message);
}

for (const message of ignoredEndorsements) console.warn(message);
console.log(`Application / permit: ${unique(runTargets.map(target => target.selectionLabel)).join(', ')}`);
if (parsed.register || parsed.approve || flow) {
  const stages = runTargets[0].stages.map(({ spec, phase }) => phase ? `${specName(spec)} [${phase}]` : specName(spec));
  const label = parsed.apply ? 'apply only' : directVariance ? 'existing conveyance' : applicantCredentials ? 'existing applicant' : 'full flow';
  const flowLabel = parsed.register ? 'registration only'
    : parsed.approve ? `approval only (Transaction # ${transactionNumber})` : `${flow} (${label})`;
  console.log(`Flow: ${flowLabel}`);
  if (conveyanceNumber) console.log(`Conveyance #: ${conveyanceNumber}`);
  console.log(`Planned stages: ${stages.join(' -> ')}`);
} else {
  console.log(`Selected spec(s): ${selectedSpecs.join(' -> ')}`);
}
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

function varianceInstallations(selection = {}) {
  const AppType = /^CV$/i.test(String(runSettings.AppType ?? '').trim()) ? undefined : runSettings.AppType;
  return selectInstallationTargets(selection, { ...runSettings, AppType }, { appTypes: VARIANCE_INSTALLATION_APP_TYPES });
}

function resolveApplicationTargets() {
  if (parsed.register) return [{ label: 'New applicant', slug: 'register' }];
  if (parsed.approve) return [{ label: 'Detect from Work Queue', slug: 'approve' }];
  if (flow === 'initial') return selectInstallationTargets(overrides, runSettings);

  if (flow === 'var') {
    const [variance] = buildApplicationTargets({ AppType: 'CV' });
    if (directVariance) return [variance];
    const installationOverrides = legacyVariance ? { ...overrides, AppType: undefined } : overrides;
    return varianceInstallations(installationOverrides).map(installation => ({
      ...variance, installation, label: `${variance.label} / ${installation.label}`, slug: `${variance.slug}-${installation.slug}`,
    }));
  }

  // Keep the original commands and matrix shortcuts working without a subcommand.
  const app = overrides.AppType || runSettings.AppType || 'NCI';
  return buildApplicationTargets({
    ...overrides,
    AppType: app,
    PerType: overrides.PerType ?? (overrides.AppType || /^CV$/i.test(app) ? 'ALL' : runSettings.PerType || 'Res'),
    ResType: overrides.ResType ?? runSettings.ResType,
    CommType: overrides.CommType ?? runSettings.CommType,
  }).map(target => {
    if (target.appType !== 'CV') return target;
    const candidates = varianceInstallations();
    return { ...target, installation: candidates[randomInt(candidates.length)] };
  });
}

async function runTarget(target, targetIndex) {
  const { label, slug, stages } = target;
  const includesRegistration = stages.some(({ spec }) => spec === SERIAL_FLOW_SPECS[0]);
  const flowDirectory = resolve(matrixArtifactRoot, slug, 'handoff', target.runId);
  const freshUserDataPath = resolve(flowDirectory, 'userData.json');
  const resultEnv = {
    ...process.env,
    ...(loginOverrides.loginName !== undefined && { LOGIN_NAME: loginOverrides.loginName }),
    ...(loginOverrides.password !== undefined && { LOGIN_PASSWORD: loginOverrides.password }),
    ...(applicantCredentials && { LOGIN_NAME: applicantCredentials.loginName, LOGIN_PASSWORD: applicantCredentials.password }),
    USER_DATA_PATH: includesRegistration ? freshUserDataPath : USER_DATA_PATH,
    CONVEYANCE_LOGIN_SOURCE: includesRegistration ? 'registered'
      : reuseApplicant ? 'existing-applicant' : 'standalone',
    CONVEYANCE_RUN_ID: target.runId,
    CONVEYANCE_FLOW_REPEAT: String(target.repeatIndex),
    CONVEYANCE_APPROVED_INSTALLATION_PATH: target.appType === 'CV' && !directVariance
      ? resolve(flowDirectory, 'approved-installation.json') : '',
    CONVEYANCE_VARIANCE_INSTALLATION_APP_TYPE: target.installation?.appType ?? '',
    CONVEYANCE_EXISTING_CONVEYANCE_NUMBER: conveyanceNumber ?? '',
    CONVEYANCE_APPROVAL_ONLY_TRANSACTION: transactionNumber ?? '',
    FULLY_PARALLEL: 'false',
  };

  console.log('\n============================================================');
  console.log(`Starting Conveyance run: ${label}`);
  console.log('============================================================\n');

  for (const [specIndex, { spec, selection, phase }] of stages.entries()) {
    const { appType, perType, permit, endorsement } = selection;
    const result = await runPlaywrightSpec({
      target,
      targetIndex,
      spec,
      specIndex,
      phase,
      env: {
        ...resultEnv,
        CONVEYANCE_APP_TYPE: appType ?? '',
        CONVEYANCE_PER_TYPE: perType ?? '',
        CONVEYANCE_RES_TYPE: permit?.override === 'ResType' ? endorsement?.code ?? '' : '',
        CONVEYANCE_COMM_TYPE: permit?.override === 'CommType' ? endorsement?.code ?? '' : '',
        CONVEYANCE_CV_PHASE: phase,
        CONVEYANCE_TRANSACTION_PATH: resolve(flowDirectory, phase === 'variance' ? 'variance-transaction.json' : 'transaction.json'),
      },
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

function runPlaywrightSpec({ target, targetIndex, spec, specIndex, phase, env, playwrightArgs: args }) {
  const artifactDir = resolve(matrixArtifactRoot, target.slug, phase ? `${specName(spec)}_${phase}` : specName(spec));
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

  console.log(`Running ${basename(spec)} for ${target.label}${phase ? ` [${phase}]` : ''}`);

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
    exitConfigurationError('npm run test requires exactly one spec, e.g. npm run test -- --spec=register or --spec=apply. Use npm run conv for the full flow.');
  }
  if (flowMode === 'e2e' && ordered.length > 0
    && (ordered.length !== SERIAL_FLOW_SPECS.length || ordered.some((spec, index) => spec !== SERIAL_FLOW_SPECS[index]))) {
    exitConfigurationError('npm run conv runs the full flow. Use npm run test -- --spec=<register|apply> to run one script.');
  }

  return ordered.length ? ordered : SERIAL_FLOW_SPECS;
}

function orderSelectedSpecs(specs) {
  const selected = unique(specs);
  const frameworkSpecs = SERIAL_FLOW_SPECS.filter((spec) => selected.includes(spec));
  const customSpecs = selected.filter((spec) => !SERIAL_FLOW_SPECS.includes(spec));
  return [...frameworkSpecs, ...customSpecs];
}

function parseCommandLine(rawArgs) {
  // PowerShell can forward an unquoted comma-separated assignment group as one argument.
  const args = rawArgs.flatMap(arg => selectionOption.exec(arg)?.[3] != null ? arg.split(selectionSeparator) : [arg]);
  const apply = args.some(arg => /^--apply$/i.test(arg));
  const result = {
    flowMode: null,
    apply,
    register: false,
    selection: {},
    inputs: {},
    selectedSpecs: [],
    playwrightArgs: [],
    parallelRuns: null,
    subcommand: null,
    existingUser: false,
    existingConveyance: false,
    approve: false,
  };
  const subcommandIndex = args.findIndex(arg => !['--', '--e2e', '--standalone'].includes(arg));

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;

    if (index === subcommandIndex && ['initial', 'var'].includes(arg.toLowerCase())) {
      result.subcommand = arg.toLowerCase();
      continue;
    }

    if (arg === '--e2e' || arg === '--standalone') {
      const flowMode = arg.slice(2);
      if (result.flowMode && result.flowMode !== flowMode) {
        exitConfigurationError('Select either the full E2E flow or a standalone script.');
      }
      result.flowMode = flowMode;
      continue;
    }

    if (/^--(?:existing-?user|existing|use-applicant)$/i.test(arg)) {
      result.existingUser = true;
      continue;
    }
    if (/^--existing-?conveyance$/i.test(arg)) {
      result.existingConveyance = true;
      continue;
    }
    if (/^--apply$/i.test(arg)) continue;
    if (/^--(?:register|regsiter)$/i.test(arg)) {
      result.register = true;
      continue;
    }
    if (arg.toLowerCase() === '--approve') {
      result.approve = true;
      continue;
    }

    const inputMatch = arg.match(/^(--)?([A-Za-z-]+)(?:=(.*))?$/);
    if (inputMatch && (inputMatch[1] || inputMatch[3] !== undefined)) {
      const key = inputMatch[2].toLowerCase().replaceAll('-', '');
      if (retiredNumberOptions.has(key)) exitConfigurationError(numberUsage);
      const field = Object.hasOwn(inputOptions, key) ? inputOptions[key] : undefined;
      if (field) {
        if (inputMatch[3] === undefined && (args[index + 1] === undefined || args[index + 1].startsWith('--'))) {
          exitConfigurationError(`--${inputMatch[2]} requires a value. Use = to clear it.`);
        }
        let value = inputMatch[3] ?? args[++index];
        if (inputMatch[3] === undefined && field === 'conveyanceNumber' && value.startsWith('=')) {
          value = value === '=' && args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : value.slice(1);
        }
        result.inputs[field] = value;
        continue;
      }
    }
    const optionMatch = arg.replace(/,$/, '').match(selectionOption);
    if (optionMatch && (optionMatch[1] || optionMatch[3] !== undefined || apply)) {
      const name = selectionOptions[optionMatch[2].toLowerCase().replace('-', '')];
      const next = args[index + 1];
      if (optionMatch[3] === undefined && (!next || next.startsWith('--') || selectionOption.test(next.replace(/,$/, '')))) {
        if (apply) continue;
        exitConfigurationError(`--${name} requires a value.`);
      }
      const value = optionMatch[3] ?? args[++index];
      // A trailing comma separates assignments; interior commas still select multiple values.
      result.selection[name] = value.trim().replace(/,$/, '').trimEnd();
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

  if (result.subcommand && result.flowMode === 'standalone') {
    exitConfigurationError('Use npm run conv initial or npm run conv var for these flows.');
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
    exitConfigurationError(`Unknown script selection: "${value ?? ''}". Use register, apply, or a spec filename.`);
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

function isTrue(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function unique(values) {
  return [...new Set(values)];
}
