import { chromium, firefox } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  availableUrlKeys,
  normalizeUrlKey,
  resolveEnvironment,
} from '../config/urls.js';
import { businessUnits, resolveBusinessUnit } from '../config/BusinessUnit.js';
import { editableData } from '../config/editableData.js';
import { baselineConfig } from '../config/baseline.config.js';
import { CompareEngine } from '../core/CompareEngine.js';
import { CaptureEngine } from '../core/CaptureEngine.js';
import { ExcelManager } from '../core/ExcelManager.js';
import { Reporter } from '../core/Reporter.js';
import { executeFlow } from '../flows/FlowRunner.js';
import { resolveTestCases, testCaseRegistry } from '../test-cases/registry.js';
import { printComparisonAnnotations } from '../utils/annotations.js';
import { logger } from '../utils/logger.js';
import { openFile, openReportArtifacts } from '../utils/openArtifacts.js';
import { getAvailableFlows, getFlowInfo } from '../utils/flowLabels.js';
import { isClosedPageError } from '../utils/pageGuards.js';

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testResultsDir = path.join(frameworkRoot, 'test-results');
const latestRunDir = path.join(testResultsDir, 'latest-run');
const BY_BUSINESS_UNIT_URL = 'ALL';
const browserProjects = {
  chromium: {
    id: 'chromium',
    name: 'Chromium',
    browserName: 'chromium',
  },
  firefox: {
    id: 'firefox',
    name: 'Firefox',
    browserName: 'firefox',
  },
  msedge: {
    id: 'msedge',
    name: 'Microsoft Edge',
    browserName: 'chromium',
    channel: 'msedge',
  },
};

const args = parseArgs(process.argv.slice(2));
const runSettings = await loadRunSettings();

if (args.list) {
  printAvailableOptions();
  process.exit(0);
}

const urlKeySelection = resolveUrlSelection(args, runSettings);
const environment = summarizeEnvironmentSelection(urlKeySelection, {
  loginUrlOverride: args.loginUrl,
  urlValue: args.url,
});
const businessUnitIds = resolveBusinessUnitSelection(args.bu ?? runSettings.defaultBusinessUnit ?? 'HLS', {
  urlKeySelection,
});
const flows = resolveFlowSelection(args.flow ?? runSettings.defaultFlow ?? '2');
const selectedIds = resolveTestCaseSelection(args, runSettings);
const testCases = resolveTestCases(selectedIds);
const projectIds = resolveProjectSelection(args.project || args.browser || runSettings.defaultProject || 'chromium');
const workers = resolveWorkerCount(args, runSettings);
const credentials = {
  username: args.username || process.env.ALIS_USERNAME || editableData.credentials.username,
  password: args.password || process.env.ALIS_PASSWORD || editableData.credentials.password,
};
const headless = resolveHeadless(args, runSettings);

let hasFailure = false;

logger.info(`Selected BUs: ${businessUnitIds.join(', ')}`);
logger.info(`Selected flows: ${flows.map((flow) => getFlowInfo(flow).label).join(', ')}`);
logger.info(`Selected test cases: ${testCases.map((testCase) => testCase.id).join(', ')}`);
logger.info(`Selected URL: ${formatUrlSelection(urlKeySelection)}`);
logger.info(`Selected browsers: ${projectIds.join(', ')}`);
logger.info(`Workers: ${workers}`);

if (args.dryRun) {
  printRunPlan({ businessUnitIds, flows, testCases, environment, projectIds, workers });
  process.exit(0);
}

const runJobs = buildRunJobs({
  businessUnitIds,
  flows,
  projectIds,
  testCases,
});
if (!runJobs.length) {
  throw new Error(
    `No selected test cases are configured for the requested business units: ${businessUnitIds.join(', ')}.`,
  );
}
await prepareLatestRunOutputDir();
const runReports = await runJobsWithWorkers(runJobs, workers, async (job) => {
  const result = await runCombination({
    args,
    runSettings,
    businessUnit: job.businessUnit,
    flow: job.flow,
    project: job.project,
    testCases: job.testCases,
    credentials,
    headless,
    reportDir: job.reportDir,
  });

  return {
    businessUnit: job.businessUnit,
    flow: job.flow,
    flowInfo: getFlowInfo(job.flow),
    browserProject: job.project,
    ...result,
  };
});

hasFailure = runReports.some((result) => result.failed);

const runIndex = await writeLatestRunIndex({
  runReports,
  latestRunDir,
  environment,
  businessUnitIds,
  flows,
  projectIds,
  workers,
  testCases,
});
logger.info(`\nLatest run index: ${runIndex.htmlPath}`);
logger.info(`Latest run summary: ${runIndex.jsonPath}`);
logger.info(`Playwright test report: ${runIndex.playwrightTestReportPath}`);

await openFile('Playwright Test Report', runIndex.playwrightTestReportPath, logger, { cacheBust: true });

if (hasFailure) {
  process.exitCode = 1;
}

async function runCombination(options) {
  const runtimeRetries = Math.max(0, Number(options.runSettings.runtimeRetries ?? 1));
  let lastResult = null;

  for (let attempt = 1; attempt <= runtimeRetries + 1; attempt += 1) {
    const result = await runCombinationOnce(options);
    lastResult = result;

    if (!result.failed || !isClosedPageError(result.error) || attempt > runtimeRetries) {
      return result;
    }

    logger.info(
      `Transient page/browser close detected for ${options.businessUnit.id} ${getFlowInfo(options.flow).label}; retrying clean run ${attempt}/${runtimeRetries}.`,
    );
  }

  return lastResult;
}

async function runCombinationOnce({
  args: parsedArgs,
  runSettings: settings,
  businessUnit,
  flow,
  project,
  testCases,
  credentials,
  headless,
  reportDir,
}) {
  const flowInfo = getFlowInfo(flow);
  const browserProject = resolveBrowserProject(project);
  const reporter = new Reporter({ reportDir });
  const combinationStart = Date.now();
  const timings = {
    setupMs: 0,
    flowMs: 0,
    baselineMs: 0,
    captureWarmupMs: 0,
    reportMs: 0,
    totalMs: 0,
  };
  let browser;
  let page;
  let runEnvironment;

  try {
    const setupStart = Date.now();
    await reporter.prepareOutputDir();

    browser = await launchBrowserForProject(browserProject, {
      headless,
      parsedArgs,
      runSettings: settings,
    });

    const browserContext = await browser.newContext(browserContextOptions(settings));
    page = await browserContext.newPage();
    timings.setupMs = elapsedMs(setupStart);

    const captureEngine = new CaptureEngine();
    const compareEngine = new CompareEngine();
    const excelManager = new ExcelManager();
    const shared = {};

    runEnvironment = resolveRunEnvironment({
      parsedArgs,
      runSettings: settings,
      businessUnit,
    });

    logger.section(`${flowInfo.label} | ${businessUnit.id} | ${runEnvironment.id} | ${browserProject.name}`);
    logger.info(flowInfo.description);
    const flowStart = Date.now();
    const flowResult = await executeFlow(page, {
      flow,
      environment: runEnvironment,
      businessUnit,
      credentials,
      entityName: parsedArgs.entity,
    });
    timings.flowMs = elapsedMs(flowStart);
    logger.info(`Flow setup/open duration: ${formatDuration(timings.flowMs)}`);

    const results = [];
    let baselinePath = '';
    const baselinesByTestCase = new Map();

    const baselineStart = Date.now();
    for (const testCase of testCases) {
      const baseline = await excelManager.readBaselineRows({
        businessUnit,
        sheetName: testCase.sheetName,
        baselineOverride: parsedArgs.baseline,
        flow,
      });
      baselinePath = baseline.baselinePath;
      baselinesByTestCase.set(testCase.id, {
        ...baseline,
        rows: baselineRowsForBusinessUnit(testCase, baseline.rows, businessUnit),
      });
    }
    timings.baselineMs = elapsedMs(baselineStart);

    shared.baselineRowsByTestCase = Object.fromEntries(
      [...baselinesByTestCase.entries()].map(([id, baseline]) => [id, baseline.rows]),
    );
    shared.selectedTestCaseIds = testCases.map((testCase) => testCase.id);
    shared.businessUnit = businessUnit;
    shared.flow = String(flow);

    const captureWarmupStart = Date.now();
    await warmCaptureSnapshot(page, captureEngine, testCases, shared);
    timings.captureWarmupMs = elapsedMs(captureWarmupStart);

    for (const testCase of testCases) {
      logger.info(`Running ${testCase.id} - ${testCase.name} | ${flowInfo.label}`);
      const testCaseStart = Date.now();
      const baseline = baselinesByTestCase.get(testCase.id);

      const runResult = await testCase.run(page, captureEngine, {
        businessUnit,
        environment: runEnvironment,
        flow,
        flowLabel: flowInfo.label,
        entityName: flowResult.entityName,
        baselineRows: baseline.rows,
        shared,
      });

      if (testCase.id === 'TC01') {
        shared.capturedTabs = runResult.rows.map((row) => row['Tab Name']);
      }

      const comparison = testCase.compare({
        baselineRows: baseline.rows,
        actualRows: runResult.rows,
        compareEngine,
      });

      const result = {
        id: testCase.id,
        name: testCase.name,
        sheetName: testCase.sheetName,
        meta: runResult.meta,
        actualRows: runResult.rows,
        comparison,
        warnings: [...captureEngine.warnings],
        durationMs: elapsedMs(testCaseStart),
      };

      results.push(result);

      printComparisonAnnotations(result, logger, { flowLabel: flowInfo.label });
      logger.info(`${testCase.id} duration: ${formatDuration(result.durationMs)}`);
    }

    timings.totalMs = elapsedMs(combinationStart);
    const reportStart = Date.now();
    const report = await reporter.write({
      results,
      context: {
        flow,
        flowLabel: flowInfo.label,
        entityName: flowResult.entityName,
        businessUnit,
        environment: runEnvironment,
        browserProject,
        baselinePath,
        timings: { ...timings },
      },
    });
    timings.reportMs = elapsedMs(reportStart);
    timings.totalMs = elapsedMs(combinationStart);

    printSummary(results, report, captureEngine.warnings, flowInfo);
    logger.info(`Combination duration: ${formatDuration(timings.totalMs)}`);
    const reportOpenOptions = resolveReportOpenOptions(parsedArgs, settings);
    if (reportOpenOptions.openExcel || reportOpenOptions.openHtml) {
      await openReportArtifacts(report, logger, reportOpenOptions);
    }

    const comparisonFailed = results.some((result) => !result.comparison.passed);

    return {
      failed: false,
      comparisonFailed,
      report,
      environment: runEnvironment,
      browserProject,
      error: '',
      durationMs: timings.totalMs,
      timings: { ...timings },
      testResults: results.map((result) => ({
        id: result.id,
        name: result.name,
        status: result.comparison.passed ? 'PASSED' : 'FAILED',
        summary: result.comparison.summary,
        durationMs: result.durationMs,
      })),
    };
  } catch (error) {
    const screenshotPath = page ? await saveFailureScreenshot(page, reporter.reportDir) : '';
    timings.totalMs = elapsedMs(combinationStart);
    logger.error(`\nRun failed (${flowInfo.label} | ${businessUnit.id} | ${browserProject.name}): ${error.message}`);

    if (page) {
      logger.error(`Current URL: ${page.url()}`);
    }

    if (screenshotPath) {
      logger.error(`Failure screenshot: ${screenshotPath}`);
    }

    logger.error(error.stack);
    return {
      failed: true,
      comparisonFailed: false,
      report: null,
      environment: runEnvironment,
      browserProject,
      error: error.message,
      durationMs: timings.totalMs,
      timings: { ...timings },
      testResults: [],
    };
  } finally {
    await browser?.close();
  }
}

function parseArgs(argv) {
  const booleanKeys = new Set([
    'all',
    'dryRun',
    'headed',
    'list',
    'serial',
  ]);
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      continue;
    }

    const [key, ...valueParts] = arg.slice(2).split('=');
    const normalizedKey = toCamelCase(key);
    let parsedValue = valueParts.length ? valueParts.join('=') : true;

    if (
      parsedValue === true
      && !booleanKeys.has(normalizedKey)
      && argv[index + 1]
      && !argv[index + 1].startsWith('--')
    ) {
      parsedValue = argv[index + 1];
      index += 1;
    }

    parsed[normalizedKey] = parsedValue;

    if (normalizedKey !== key) {
      parsed[key] = parsedValue;
    }
  }

  return parsed;
}

function toCamelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCsv(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadRunSettings() {
  const runSettingsPath = new URL('../config/runSettings.json', import.meta.url);
  const content = await fs.readFile(runSettingsPath, 'utf8');
  return JSON.parse(content);
}

function resolveUrlSelection(parsedArgs, settings) {
  const value = parsedArgs.url
    || parsedArgs.urlKey
    || parsedArgs.urlName
    || parsedArgs.environment
    || parsedArgs.env
    || settings.defaultUrl
    || settings.defaultUrlKey;

  if (!String(value || '').trim()) {
    throw new Error('URL is required. Provide --url=<URL_KEY> or set "defaultUrl" in config/runSettings.json.');
  }

  const requested = parseCsv(value);

  if (requested.some((item) => isByBusinessUnitUrl(item))) {
    return BY_BUSINESS_UNIT_URL;
  }

  if (requested.length > 1) {
    if (requested.some((item) => isRawHttpUrl(item))) {
      throw new Error('Use only one full HTTP URL with --url, or use configured URL keys like --url=NJ,NVRCP.');
    }

    return [...new Set(requested.map((item) => normalizeKnownUrlKey(item)))];
  }

  if (isRawHttpUrl(value)) {
    return normalizeUrlKey(settings.defaultUrl || settings.defaultUrlKey);
  }

  return normalizeKnownUrlKey(value);
}

function summarizeEnvironmentSelection(urlKeySelection, { loginUrlOverride, urlValue } = {}) {
  if (urlKeySelection === BY_BUSINESS_UNIT_URL) {
    return {
      id: 'ALL',
      name: 'All Configured URLs',
      loginUrl: 'Configured per business unit',
    };
  }

  if (isMultiUrlSelection(urlKeySelection)) {
    return {
      id: formatUrlSelection(urlKeySelection),
      name: 'Selected Configured URLs',
      loginUrl: 'Configured per selected business unit',
    };
  }

  const id = normalizeUrlKey(urlKeySelection);
  const environment = resolveEnvironment({
    urlKey: id,
    loginUrlOverride,
  });

  return {
    ...environment,
    loginUrl: isRawHttpUrl(urlValue) ? urlValue : environment.loginUrl,
  };
}

function isRawHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isByBusinessUnitUrl(value) {
  return ['ALL', 'BY-BU', 'BY_BU', 'BYBU', 'PER-BU', 'PER_BU', 'BU'].includes(
    String(value || '').trim().toUpperCase(),
  );
}

function normalizeKnownUrlKey(value) {
  const normalized = normalizeUrlKey(value);

  if (!availableUrlKeys().includes(normalized)) {
    throw new Error(
      `Unknown URL key "${normalized}". Available URL keys: ${availableUrlKeys().join(', ')}.`,
    );
  }

  return normalized;
}

function isMultiUrlSelection(urlKeySelection) {
  return Array.isArray(urlKeySelection);
}

function selectedSpecificUrlKeys(urlKeySelection) {
  if (!urlKeySelection || urlKeySelection === BY_BUSINESS_UNIT_URL) {
    return [];
  }

  return isMultiUrlSelection(urlKeySelection)
    ? urlKeySelection.map((urlKey) => normalizeKnownUrlKey(urlKey))
    : [normalizeKnownUrlKey(urlKeySelection)];
}

function formatUrlSelection(urlKeySelection) {
  return isMultiUrlSelection(urlKeySelection)
    ? urlKeySelection.join(',')
    : String(urlKeySelection || '');
}

function defaultTestCaseSelection(settings) {
  if (Array.isArray(settings.defaultTestCases) && settings.defaultTestCases.length) {
    return settings.defaultTestCases.join(',');
  }

  if (typeof settings.defaultTestCases === 'string' && settings.defaultTestCases.trim()) {
    return settings.defaultTestCases;
  }

  return Object.keys(testCaseRegistry).join(',');
}

function resolveBusinessUnitSelection(value, { urlKeySelection } = {}) {
  const requested = parseCsv(value).map((item) => normalizeId(item));
  const requestedAll = !requested.length || requested.some((item) => item === 'ALL');
  const selectedUrlKeys = selectedSpecificUrlKeys(urlKeySelection);

  if (requestedAll && isSpecificUrlSelection(urlKeySelection)) {
    const matchingBusinessUnitIds = Object.keys(businessUnits)
      .filter((businessUnitId) => {
        const businessUnitUrlKey = configuredBusinessUnitUrlKey(businessUnits[businessUnitId], businessUnitId);
        return selectedUrlKeys.includes(businessUnitUrlKey);
      });

    if (!matchingBusinessUnitIds.length) {
      throw new Error(
        `No business units are configured for URL "${formatUrlSelection(urlKeySelection)}". Check config/BusinessUnit.js or use --url=all.`,
      );
    }

    return matchingBusinessUnitIds.map((businessUnitId) => configuredBusinessUnitId(businessUnitId));
  }

  const selectedBusinessUnitKeys = resolveRegisteredSelection({
    value,
    availableIds: Object.keys(businessUnits),
    label: 'business unit',
  });

  if (!requestedAll && isMultiUrlSelection(urlKeySelection)) {
    const mismatchedBusinessUnits = selectedBusinessUnitKeys.filter((businessUnitId) => {
      const businessUnitUrlKey = configuredBusinessUnitUrlKey(businessUnits[businessUnitId], businessUnitId);
      return !selectedUrlKeys.includes(businessUnitUrlKey);
    });

    if (mismatchedBusinessUnits.length) {
      throw new Error(
        `Business unit(s) ${mismatchedBusinessUnits.join(', ')} are not configured for --url=${formatUrlSelection(urlKeySelection)}. Add their URL key or remove them from --bu.`,
      );
    }
  }

  return selectedBusinessUnitKeys.map((businessUnitId) => configuredBusinessUnitId(businessUnitId));
}

function configuredBusinessUnitUrlKey(businessUnit, businessUnitId = businessUnit?.id || '') {
  if (!String(businessUnit?.urlKey || '').trim()) {
    throw new Error(`Business unit "${businessUnitId}" is missing urlKey in config/BusinessUnit.js.`);
  }

  return normalizeKnownUrlKey(businessUnit.urlKey);
}

function configuredBusinessUnitId(businessUnitKey) {
  const normalizedKey = normalizeId(businessUnitKey);
  return businessUnits[normalizedKey]?.id || normalizedKey;
}

function isSpecificUrlSelection(urlKeySelection) {
  return Boolean(urlKeySelection)
    && urlKeySelection !== BY_BUSINESS_UNIT_URL
    && selectedSpecificUrlKeys(urlKeySelection).length > 0;
}

function resolveFlowSelection(value) {
  return resolveRegisteredSelection({
    value,
    availableIds: getAvailableFlows().map((flow) => flow.id),
    label: 'flow',
    normalize: (item) => String(item).trim(),
  });
}

function resolveProjectSelection(value) {
  return resolveRegisteredSelection({
    value,
    availableIds: Object.keys(browserProjects),
    label: 'browser project',
    normalize: normalizeProjectId,
  });
}

function normalizeProjectId(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['edge', 'ms-edge', 'microsoftedge', 'microsoft-edge'].includes(normalized)) {
    return 'msedge';
  }

  if (['chrome', 'googlechrome', 'google-chrome'].includes(normalized)) {
    return 'chromium';
  }

  return normalized;
}

function resolveTestCaseSelection(parsedArgs, settings) {
  if (parsedArgs.all) {
    return Object.keys(testCaseRegistry);
  }

  return resolveRegisteredSelection({
    value: parsedArgs.tc || defaultTestCaseSelection(settings),
    availableIds: Object.keys(testCaseRegistry),
    label: 'test case',
  });
}

function resolveRegisteredSelection({ value, availableIds, label, normalize = normalizeId }) {
  const normalizedAvailable = availableIds.map((id) => normalize(id));
  const requested = parseCsv(value).map((item) => normalize(item));

  if (!requested.length || requested.some((item) => String(item).toUpperCase() === 'ALL')) {
    return normalizedAvailable;
  }

  const unknown = requested.filter((item) => !normalizedAvailable.includes(item));
  if (unknown.length) {
    throw new Error(
      `Unknown ${label}${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${normalizedAvailable.join(', ')} or ALL.`,
    );
  }

  return [...new Set(requested)];
}

function normalizeId(value) {
  return String(value).trim().toUpperCase();
}

function resolveWorkerCount(parsedArgs, settings) {
  if (parsedArgs.serial) {
    return 1;
  }

  const explicitWorkerValue = parsedArgs.workers ?? parsedArgs.worker;

  if (explicitWorkerValue !== undefined) {
    return parsePositiveWorkerCount(explicitWorkerValue, 1);
  }

  if (parsedArgs.parallel !== undefined) {
    if (parsedArgs.parallel === true) {
      return parsePositiveWorkerCount(settings.parallelWorkers ?? settings.workers ?? 3, 3);
    }

    return parsePositiveWorkerCount(parsedArgs.parallel, 3);
  }

  const environmentWorkerValue = process.env.BASELINE_WORKERS ?? process.env.PW_WORKERS;
  if (environmentWorkerValue !== undefined) {
    return parsePositiveWorkerCount(environmentWorkerValue, 1);
  }

  if (asBoolean(settings.fullyParallel, false)) {
    return parsePositiveWorkerCount(process.env.CI ? settings.ciWorkers : settings.workers, 1);
  }

  return 1;
}

function parsePositiveWorkerCount(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.max(1, Math.floor(numeric));
}

async function prepareLatestRunOutputDir() {
  ensureInsideFramework(latestRunDir);
  await fs.mkdir(testResultsDir, { recursive: true });

  await Promise.all([
    removeIfUnlocked(latestRunDir),
    removeIfUnlocked(path.join(testResultsDir, 'latest-results.json')),
    removeIfUnlocked(path.join(testResultsDir, 'latest-failure.png')),
    removeIfUnlocked(path.join(testResultsDir, 'playwright-report')),
  ]);

  const entries = await fs.readdir(testResultsDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^~?\$?latest-report.*\.xlsx$/i.test(entry.name))
      .map((entry) => removeIfUnlocked(path.join(testResultsDir, entry.name))),
  );

  await fs.mkdir(latestRunDir, { recursive: true });
}

async function removeIfUnlocked(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      logger.error(`Could not remove old output because it is open or locked: ${targetPath}`);
      logger.error('Close the file and run again if you need a completely clean latest-run folder.');
      return;
    }

    throw error;
  }
}

function ensureInsideFramework(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const relativeTarget = path.relative(frameworkRoot, resolvedTarget);

  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(`Refusing to write outside framework root: ${resolvedTarget}`);
  }
}

function buildRunJobs({ businessUnitIds, flows, projectIds, testCases }) {
  const includeProjectInSlug = projectIds.length > 1 || projectIds[0] !== 'chromium';
  const jobs = [];

  for (const flow of flows) {
    for (const businessUnitId of businessUnitIds) {
      const businessUnit = resolveBusinessUnit(businessUnitId);
      const applicableTestCases = testCases.filter((testCase) => (
        testCaseSupportsBusinessUnit(testCase, businessUnit)
      ));

      if (!applicableTestCases.length) {
        logger.info(
          `Skipped ${businessUnit.id} ${getFlowInfo(flow).label}: selected test cases are not configured for this BU.`,
        );
        continue;
      }

      for (const projectId of projectIds) {
        const project = resolveBrowserProject(projectId);
        const reportDir = path.join(
          latestRunDir,
          buildCombinationSlug({
            businessUnit,
            flow,
            project,
            includeProject: includeProjectInSlug,
          }),
        );

        jobs.push({
          businessUnit,
          flow,
          project,
          testCases: applicableTestCases,
          reportDir,
        });
      }
    }
  }

  return jobs;
}

function testCaseSupportsBusinessUnit(testCase, businessUnit) {
  if (!Array.isArray(testCase.businessUnitIds) || !testCase.businessUnitIds.length) {
    return true;
  }

  return testCase.businessUnitIds
    .map((id) => normalizeId(id))
    .includes(normalizeId(businessUnit.id));
}

function baselineRowsForBusinessUnit(testCase, rows, businessUnit) {
  if (testCase.id === 'TC01' || !Array.isArray(rows)) {
    return rows;
  }

  const skippedTabs = new Set(
    (businessUnit.skippedDetailTabs || []).map((tabName) => normalizeId(tabName)),
  );

  if (!skippedTabs.size) {
    return rows;
  }

  return rows.filter((row) => !skippedTabs.has(normalizeId(row['Parent Tab'])));
}

async function runJobsWithWorkers(jobs, workers, runner) {
  const results = new Array(jobs.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(workers, 1), jobs.length || 1);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < jobs.length) {
        const currentIndex = cursor;
        cursor += 1;
        results[currentIndex] = await runner(jobs[currentIndex]);
      }
    }),
  );

  return results;
}

function resolveBrowserProject(project) {
  const projectId = normalizeProjectId(project?.id || project);
  const browserProject = browserProjects[projectId];

  if (!browserProject) {
    throw new Error(`Unknown browser project "${project}". Available: ${Object.keys(browserProjects).join(', ')} or ALL.`);
  }

  return browserProject;
}

async function launchBrowserForProject(project, { headless, parsedArgs, runSettings: settings }) {
  const browserType = project.browserName === 'firefox' ? firefox : chromium;
  const baseLaunchOptions = {
    headless,
    slowMo: Number(parsedArgs.slowMo ?? settings.slowMo ?? 0),
    args: browserLaunchArgs({ headless, runSettings: settings }),
  };

  if (project.channel) {
    return browserType.launch({
      ...baseLaunchOptions,
      channel: project.channel,
    });
  }

  return browserType.launch(baseLaunchOptions);
}

function buildCombinationSlug({ businessUnit, flow, project, includeProject = false }) {
  const baseSlug = `${businessUnit.id}_${getFlowInfo(flow).label}`;
  const projectSuffix = includeProject ? `_${project.id}` : '';

  return safePathSegment(`${baseSlug}${projectSuffix}`);
}

function safePathSegment(value) {
  return String(value)
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

async function writeLatestRunIndex({
  runReports,
  latestRunDir,
  environment,
  businessUnitIds,
  flows,
  projectIds,
  workers,
  testCases,
}) {
  await fs.mkdir(latestRunDir, { recursive: true });

  const generatedAt = formatReportTimestamp();
  const jsonPath = path.join(latestRunDir, 'latest-run-summary.json');
  const htmlPath = path.join(latestRunDir, 'index.html');
  const playwrightTestReportPath = path.join(latestRunDir, 'playwright-test-report', 'index.html');
  const summary = {
    generatedAt,
    playwrightTestReportPath,
    environment: {
      id: environment.id,
      loginUrl: environment.loginUrl,
    },
    businessUnits: businessUnitIds,
    flows,
    browserProjects: projectIds,
    workers,
    testCases: testCases.map((testCase) => testCase.id),
    reports: runReports.map((entry) => ({
      businessUnit: entry.businessUnit.id,
      businessUnitName: entry.businessUnit.name,
      flow: entry.flow,
      flowLabel: entry.flowInfo.label,
      browserProject: entry.browserProject?.id || '',
      browserName: entry.browserProject?.name || '',
      urlKey: entry.environment?.id || '',
      loginUrl: entry.environment?.loginUrl || '',
      status: entry.failed ? 'FAILED' : 'PASSED',
      comparisonStatus: entry.comparisonFailed ? 'FAILED' : 'PASSED',
      error: entry.error || '',
      durationMs: entry.durationMs || 0,
      timings: entry.timings || {},
      excelPath: entry.report?.excelPath || '',
      jsonPath: entry.report?.jsonPath || '',
      htmlReportPath: entry.report?.htmlReportPath || '',
      testResults: entry.testResults || [],
    })),
  };

  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(htmlPath, buildLatestRunHtml({ summary, htmlPath }), 'utf8');
  await fs.mkdir(path.dirname(playwrightTestReportPath), { recursive: true });
  await fs.writeFile(
    playwrightTestReportPath,
    buildPlaywrightStyleHtml({ summary, htmlPath: playwrightTestReportPath }),
    'utf8',
  );

  return { htmlPath, jsonPath, playwrightTestReportPath };
}

function buildLatestRunHtml({ summary, htmlPath }) {
  const passed = summary.reports.filter((report) => report.status === 'PASSED').length;
  const failed = summary.reports.length - passed;
  const playwrightReportLink = summary.playwrightTestReportPath
    ? `<a href="${relativeHref(htmlPath, summary.playwrightTestReportPath)}">Open Playwright Test Report</a>`
    : '';
  const rows = summary.reports.map((report) => {
    const htmlLink = report.htmlReportPath
      ? `<a href="${relativeHref(htmlPath, report.htmlReportPath)}">HTML</a>`
      : '';
    const excelLink = report.excelPath
      ? `<a href="${relativeHref(htmlPath, report.excelPath)}">Excel</a>`
      : '';
    const jsonLink = report.jsonPath
      ? `<a href="${relativeHref(htmlPath, report.jsonPath)}">JSON</a>`
      : '';
    const links = [htmlLink, excelLink, jsonLink].filter(Boolean).join(' | ');

    return `<tr>
      <td>${escapeHtml(report.businessUnit)}</td>
      <td>${escapeHtml(report.flowLabel)}</td>
      <td>${escapeHtml(report.browserName || report.browserProject || '')}</td>
      <td>${escapeHtml(report.urlKey || '')}</td>
      <td><span class="${report.status === 'PASSED' ? 'pass' : 'fail'}">${escapeHtml(report.status)}</span></td>
      <td><span class="${report.comparisonStatus === 'PASSED' ? 'pass' : 'fail'}">${escapeHtml(report.comparisonStatus || '')}</span></td>
      <td>${escapeHtml(formatDuration(report.durationMs))}</td>
      <td>${links || '-'}</td>
      <td>${escapeHtml(report.error || '')}</td>
    </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ALiS Latest Run</title>
  <style>
    body { margin: 0; background: #f6f8fb; color: #172033; font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; }
    header { background: #1f4e78; color: #fff; padding: 22px 28px; }
    header h1 { margin: 0 0 6px; font-size: 24px; }
    header p { margin: 0; color: #dbe8f4; }
    main { padding: 24px 28px 36px; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric, .panel { background: #fff; border: 1px solid #d8dee9; border-radius: 6px; padding: 14px; }
    .label { color: #5b667a; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border-bottom: 1px solid #d8dee9; padding: 10px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #5b667a; font-size: 12px; text-transform: uppercase; }
    a { color: #1f4e78; font-weight: 650; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pass { color: #137333; font-weight: 700; }
    .fail { color: #b3261e; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <h1>ALiS Latest Run</h1>
    <p>${escapeHtml(summary.environment.id)} | ${escapeHtml(summary.generatedAt)}</p>
  </header>
  <main>
    <section class="summary">
      <div class="metric"><div class="label">Combinations</div><div class="value">${summary.reports.length}</div></div>
      <div class="metric"><div class="label">Passed</div><div class="value pass">${passed}</div></div>
      <div class="metric"><div class="label">Failed</div><div class="value fail">${failed}</div></div>
      <div class="metric"><div class="label">Workers</div><div class="value">${escapeHtml(summary.workers)}</div></div>
    </section>
    <section class="panel">
      ${playwrightReportLink ? `<p>${playwrightReportLink}</p>` : ''}
      <table>
        <thead>
          <tr>
            <th>BU</th>
            <th>Flow</th>
            <th>Browser</th>
            <th>URL Key</th>
            <th>Runtime</th>
            <th>Comparison</th>
            <th>Duration</th>
            <th>Reports</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function buildPlaywrightStyleHtml({ summary, htmlPath }) {
  const testRows = flattenPlaywrightStyleRows(summary);
  const passed = testRows.filter((row) => row.status === 'PASSED').length;
  const failed = testRows.filter((row) => row.status === 'FAILED').length;
  const comparisonFailedRows = testRows.filter((row) => row.status === 'PASSED' && row.comparisonStatus === 'FAILED');
  const comparisonFailed = comparisonFailedRows.length;
  const skipped = 0;
  const flaky = 0;
  const total = testRows.length;
  const generatedAt = summary.generatedAt || formatReportTimestamp();
  const browserNames = [...new Set(summary.reports.map((report) => report.browserName || report.browserProject).filter(Boolean))];
  const projectText = browserNames.length === 1 ? browserNames[0].toLowerCase() : browserNames.join(', ');

  const rows = testRows.map((row) => {
    const title = playwrightStyleTitle(row);
    const metaLine = playwrightStyleMetaLine(row);
    const stats = playwrightStyleStats(row);

    return `<article class="test-row" data-status="${escapeHtml(row.status)}" data-comparison-status="${escapeHtml(row.comparisonStatus || '')}" data-search="${escapeHtml(`${title} ${metaLine} ${stats}`.toLowerCase())}">
      <div class="status-dot ${row.status === 'PASSED' ? 'pass-bg' : 'fail-bg'}">${row.status === 'PASSED' ? 'PASS' : 'FAIL'}</div>
      <div class="test-main">
        <div class="test-title">${escapeHtml(title)}</div>
        <div class="test-meta">${escapeHtml(metaLine)}</div>
        <div class="test-stats">${escapeHtml(stats)}</div>
        <div class="test-links">${playwrightStyleLinks(row, htmlPath) || '-'}</div>
      </div>
      <div class="tags">
        <span>${escapeHtml(row.browserName || row.browserProject || '')}</span>
        <span>${escapeHtml(row.urlKey || '')}</span>
        <span>${escapeHtml(row.businessUnit || '')}</span>
      </div>
    </article>`;
  }).join('\n');
  const comparisonFailureRows = comparisonFailedRows.map((row) => {
    const title = playwrightStyleTitle(row);
    const metaLine = playwrightStyleMetaLine(row);
    const stats = playwrightStyleStats(row);

    return `<article class="comparison-row" data-search="${escapeHtml(`${title} ${metaLine} ${stats}`.toLowerCase())}">
      <div class="compare-dot">COMPARE FAIL</div>
      <div class="test-main">
        <div class="test-title">${escapeHtml(title)}</div>
        <div class="test-meta">${escapeHtml(metaLine)}</div>
        <div class="test-stats">${escapeHtml(stats)}</div>
        <div class="test-links">${playwrightStyleLinks(row, htmlPath) || '-'}</div>
      </div>
    </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ALiS Baseline Playwright Test Report</title>
  <style>
    :root {
      --bg: #111;
      --panel: #171b22;
      --panel-2: #0d1117;
      --border: #2f3846;
      --text: #e8edf5;
      --muted: #9aa7b8;
      --pass: #38d66b;
      --fail: #ff6b64;
      --tag-blue: #0f4c96;
      --tag-orange: #693400;
      --tag-purple: #4b1a79;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; }
    main { width: min(1220px, calc(100vw - 44px)); margin: 22px auto 42px; }
    .toolbar { display: grid; grid-template-columns: minmax(240px, 1fr) auto; gap: 20px; align-items: center; margin-bottom: 18px; }
    input { width: 100%; background: #090d13; color: var(--text); border: 1px solid var(--border); border-radius: 7px; padding: 12px 14px; font-size: 15px; }
    .filters { display: flex; gap: 0; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; background: var(--panel-2); }
    .filter { border: 0; border-right: 1px solid var(--border); background: transparent; color: var(--text); padding: 10px 13px; font-weight: 650; cursor: pointer; }
    .filter:last-child { border-right: 0; }
    .filter.active { background: #202734; }
    .count { display: inline-block; min-width: 23px; margin-left: 7px; padding: 2px 7px; border-radius: 999px; background: #344052; color: #dfe8f5; }
    .project-line { display: flex; justify-content: space-between; color: var(--muted); margin: 8px 0 14px; font-size: 15px; }
    .comparison-panel { display: none; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; background: var(--panel); margin-bottom: 16px; }
    .comparison-panel.active { display: block; }
    .comparison-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 16px; border-bottom: 1px solid var(--border); background: #171d26; }
    .comparison-header h2 { margin: 0; font-size: 16px; color: #f1f5fb; }
    .comparison-header p { margin: 4px 0 0; color: var(--muted); }
    .comparison-count { min-width: 32px; text-align: center; border-radius: 999px; padding: 5px 10px; color: #ffd7a0; background: rgba(255, 183, 77, .12); border: 1px solid rgba(255, 183, 77, .45); font-weight: 800; }
    .suite { border: 1px solid var(--border); border-radius: 7px; overflow: hidden; background: var(--panel); }
    .suite-header { padding: 13px 16px; border-bottom: 1px solid var(--border); font-weight: 700; background: #171d26; }
    .test-row, .comparison-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; gap: 12px; padding: 13px 14px; border-bottom: 1px solid var(--border); align-items: start; }
    .test-row:last-child, .comparison-row:last-child { border-bottom: 0; }
    .status-dot { width: 48px; border-radius: 999px; padding: 4px 0; text-align: center; font-size: 11px; font-weight: 800; }
    .compare-dot { width: 76px; border-radius: 999px; padding: 4px 0; text-align: center; font-size: 10px; font-weight: 800; color: #ffd7a0; background: rgba(255, 183, 77, .12); border: 1px solid rgba(255, 183, 77, .45); }
    .pass-bg { background: rgba(56, 214, 107, .12); color: var(--pass); border: 1px solid rgba(56, 214, 107, .45); }
    .fail-bg { background: rgba(255, 107, 100, .13); color: var(--fail); border: 1px solid rgba(255, 107, 100, .50); }
    .test-title { font-size: 16px; font-weight: 700; line-height: 1.35; color: #f1f5fb; }
    .test-meta, .test-stats { color: var(--muted); margin-top: 5px; line-height: 1.35; }
    .test-links { margin-top: 6px; }
    a { color: #72a7ff; font-weight: 650; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 390px; }
    .tags span { border: 1px solid #2f75d6; color: #8db9ff; background: #081f45; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
    .summary { color: var(--muted); margin-top: 10px; }
    .empty { padding: 22px; color: var(--muted); }
  </style>
</head>
<body>
  <main>
    <section class="toolbar">
      <input id="search" type="search" placeholder="Search tests">
      <div class="filters">
        <button class="filter active" data-filter="ALL">All <span class="count">${total}</span></button>
        <button class="filter" data-filter="PASSED">Passed <span class="count">${passed}</span></button>
        <button class="filter" data-filter="FAILED">Failed <span class="count">${failed}</span></button>
        <button class="filter" data-filter="COMPARISON_FAILED">Comparison Failed <span class="count">${comparisonFailed}</span></button>
        <button class="filter" data-filter="FLAKY">Flaky <span class="count">${flaky}</span></button>
        <button class="filter" data-filter="SKIPPED">Skipped <span class="count">${skipped}</span></button>
      </div>
    </section>
    <section class="project-line">
      <div>Project: ${escapeHtml(projectText || 'baseline')}</div>
      <div>Latest run only: ${escapeHtml(generatedAt)} &nbsp; Total combinations: ${summary.reports.length}</div>
    </section>
    <section id="comparison-panel" class="comparison-panel">
      <div class="comparison-header">
        <div>
          <h2>Comparison Failures</h2>
          <p>Runtime passed, but expected data did not match the live UI.</p>
        </div>
        <span class="comparison-count">${comparisonFailed}</span>
      </div>
      <div>${comparisonFailureRows || '<div class="empty">No comparison failures in this run.</div>'}</div>
    </section>
    <section id="suite-panel" class="suite">
      <div class="suite-header">ALiS_Baseline</div>
      <div id="rows">${rows || '<div class="empty">No test rows were produced.</div>'}</div>
    </section>
    <div class="summary">Client: ${escapeHtml(summary.environment.id)} | Workers: ${escapeHtml(summary.workers)} | Test cases: ${escapeHtml(summary.testCases.join(', '))}</div>
  </main>
  <script>
    const search = document.getElementById('search');
    const filters = [...document.querySelectorAll('.filter')];
    const rows = [...document.querySelectorAll('.test-row')];
    const comparisonRows = [...document.querySelectorAll('.comparison-row')];
    const suitePanel = document.getElementById('suite-panel');
    const comparisonPanel = document.getElementById('comparison-panel');
    let activeFilter = 'ALL';

    function applyFilters() {
      const query = search.value.trim().toLowerCase();

      if (activeFilter === 'COMPARISON_FAILED') {
        suitePanel.style.display = 'none';
        comparisonPanel.classList.add('active');
        for (const row of comparisonRows) {
          const searchOk = !query || row.dataset.search.includes(query);
          row.style.display = searchOk ? '' : 'none';
        }
        return;
      }

      comparisonPanel.classList.remove('active');
      suitePanel.style.display = '';
      for (const row of rows) {
        const statusOk = activeFilter === 'ALL' || row.dataset.status === activeFilter;
        const searchOk = !query || row.dataset.search.includes(query);
        row.style.display = statusOk && searchOk ? '' : 'none';
      }
    }

    search.addEventListener('input', applyFilters);
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        filters.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        activeFilter = button.dataset.filter;
        applyFilters();
      });
    });
  </script>
</body>
</html>`;
}

function playwrightStyleTitle(row) {
  return `${row.businessUnit} ${row.flowLabel} - ${row.testId} ${row.testName}`;
}

function playwrightStyleMetaLine(row) {
  return `${row.businessUnitName} | ${row.urlKey} | ${row.browserName}`;
}

function playwrightStyleStats(row) {
  return row.summary
    ? `comparison=${row.comparisonStatus || row.status}, expected=${row.summary.expected}, actual=${row.summary.actual}, matched=${row.summary.matched}, mismatch=${row.summary.mismatch}, missing=${row.summary.missing}, extra=${row.summary.extra}, duration=${formatDuration(row.durationMs)}`
    : row.error || '';
}

function playwrightStyleLinks(row, htmlPath) {
  const htmlLink = row.htmlReportPath
    ? `<a href="${relativeHref(htmlPath, row.htmlReportPath)}">HTML</a>`
    : '';
  const excelLink = row.excelPath
    ? `<a href="${relativeHref(htmlPath, row.excelPath)}">Excel</a>`
    : '';
  const jsonLink = row.jsonPath
    ? `<a href="${relativeHref(htmlPath, row.jsonPath)}">JSON</a>`
    : '';

  return [htmlLink, excelLink, jsonLink].filter(Boolean).join(' | ');
}

function flattenPlaywrightStyleRows(summary) {
  const selectedBusinessUnits = new Set(summary.businessUnits || []);
  const selectedFlows = new Set((summary.flows || []).map(String));
  const selectedProjects = new Set(summary.browserProjects || []);
  const selectedTestCases = new Set(summary.testCases || []);

  return summary.reports.filter((report) => (
    (!selectedBusinessUnits.size || selectedBusinessUnits.has(report.businessUnit))
    && (!selectedFlows.size || selectedFlows.has(String(report.flow)))
    && (!selectedProjects.size || selectedProjects.has(report.browserProject))
  )).flatMap((report) => {
    const runtimeStatus = report.error ? 'FAILED' : 'PASSED';

    if (!report.testResults?.length) {
      return [{
        ...report,
        testId: 'Runtime',
        testName: report.error ? 'Setup / Navigation' : 'No Test Results',
        status: runtimeStatus,
        comparisonStatus: report.comparisonStatus || report.status,
        summary: null,
        durationMs: report.durationMs || 0,
      }];
    }

    return report.testResults
      .filter((testResult) => !selectedTestCases.size || selectedTestCases.has(testResult.id))
      .map((testResult) => ({
        ...report,
        testId: testResult.id,
        testName: testResult.name,
        status: runtimeStatus,
        comparisonStatus: testResult.status,
        summary: testResult.summary,
        durationMs: testResult.durationMs || 0,
      }));
  });
}

function relativeHref(fromFilePath, targetPath) {
  return path.relative(path.dirname(fromFilePath), targetPath).replace(/\\/g, '/');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatReportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  return [
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    `${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`,
  ].join(' ');
}

function elapsedMs(start) {
  return Math.max(0, Date.now() - start);
}

function formatDuration(durationMs = 0) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function resolveHeadless(parsedArgs, settings) {
  if (parsedArgs.headed) {
    return false;
  }

  if (parsedArgs.headless !== undefined) {
    return asBoolean(parsedArgs.headless, true);
  }

  return asBoolean(settings.headless, true);
}

function resolveReportOpenOptions(parsedArgs, settings) {
  const legacyFallback = parsedArgs.openReports !== undefined
    ? asBoolean(parsedArgs.openReports, true)
    : asBoolean(settings.openReports, true);

  const openExcel = parsedArgs.openExcelReport !== undefined
    ? asBoolean(parsedArgs.openExcelReport, true)
    : asBoolean(settings.openExcelReport, legacyFallback);

  const openHtml = parsedArgs.openHtmlReport !== undefined
    ? asBoolean(parsedArgs.openHtmlReport, true)
    : asBoolean(settings.openHtmlReport, legacyFallback);

  return { openExcel, openHtml };
}

function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  return fallback;
}

function browserLaunchArgs({ headless, runSettings: settings }) {
  if (!headless && settings.maximizeWindow) {
    return ['--start-maximized'];
  }

  return [];
}

function browserContextOptions(settings) {
  const options = {};

  if (Object.hasOwn(settings, 'viewport')) {
    options.viewport = settings.viewport;
  }

  return options;
}

async function warmCaptureSnapshot(page, captureEngine, testCases, shared) {
  const detailIds = new Set(['TC02', 'TC03', 'TC04', 'TC05']);
  const selectedDetailIds = testCases
    .map((testCase) => testCase.id)
    .filter((id) => detailIds.has(id));

  if (selectedDetailIds.length < 2) {
    return;
  }

  const tabs = shared.capturedTabs?.length ? shared.capturedTabs : await captureEngine.captureTabs(page);
  shared.capturedTabs = tabs;
  shared.captureSnapshot = await captureEngine.captureSnapshotByTab(page, tabs, {
    includeSectionHeaders: selectedDetailIds.includes('TC02'),
    includeFieldLabels: selectedDetailIds.includes('TC03'),
    includeTableColumnHeaders: selectedDetailIds.includes('TC04'),
    includeInformativeText: selectedDetailIds.includes('TC05'),
    fieldExpectedRows: shared.baselineRowsByTestCase.TC03 || [],
    tableExpectedRows: shared.baselineRowsByTestCase.TC04 || [],
    informativeTextExpectedRows: shared.baselineRowsByTestCase.TC05 || [],
    businessUnit: shared.businessUnit,
    runTableHeaderPreconditions: !['3', '4'].includes(String(shared.flow)),
  });
}

function resolveRunEnvironment({ parsedArgs, runSettings: settings, businessUnit }) {
  const selectedUrlKey = resolveUrlSelection(parsedArgs, settings);
  const businessUnitUrlKey = configuredBusinessUnitUrlKey(businessUnit, businessUnit.id);
  const urlKey = resolveUrlKeyForBusinessUnit(selectedUrlKey, businessUnitUrlKey, businessUnit);
  const loginUrlOverride = isRawHttpUrl(parsedArgs.url)
    ? parsedArgs.url
    : parsedArgs.loginUrl;

  return resolveEnvironment({
    urlKey,
    loginUrlOverride,
  });
}

function resolveUrlKeyForBusinessUnit(selectedUrlKey, businessUnitUrlKey, businessUnit) {
  if (selectedUrlKey === BY_BUSINESS_UNIT_URL) {
    return businessUnitUrlKey;
  }

  if (isMultiUrlSelection(selectedUrlKey)) {
    const selectedUrlKeys = selectedSpecificUrlKeys(selectedUrlKey);
    if (!selectedUrlKeys.includes(businessUnitUrlKey)) {
      throw new Error(
        `Business unit "${businessUnit.id}" is configured for URL "${businessUnitUrlKey}", which is not in --url=${formatUrlSelection(selectedUrlKey)}.`,
      );
    }

    return businessUnitUrlKey;
  }

  return normalizeKnownUrlKey(selectedUrlKey);
}

function printAvailableOptions() {
  logger.info('Available business units:');
  for (const [businessUnitId, businessUnit] of Object.entries(businessUnits)) {
    logger.info(`  ${businessUnitId}: ${businessUnit.name} (usual URL: ${businessUnit.urlKey || 'MISSING'})`);
  }

  logger.info('');
  logger.info('Available URLs:');
  for (const urlKey of availableUrlKeys()) {
    const environment = resolveEnvironment({ urlKey });
    logger.info(`  --url=${urlKey}: ${environment.loginUrl}`);
  }
  logger.info('  --url=all: use each configured BU URL key from config/BusinessUnit.js');
  logger.info('  --login-url=<full URL>: override the selected profile login URL directly');

  logger.info('');
  logger.info('Available flows:');
  for (const flowOption of getAvailableFlows()) {
    logger.info(`  --flow=${flowOption.id}: ${flowOption.label} - ${flowOption.description}`);
  }

  logger.info('');
  logger.info('Available test cases:');
  for (const testCase of Object.values(testCaseRegistry)) {
    logger.info(`  ${testCase.id}: ${testCase.name} (${testCase.sheetName})`);
  }

  logger.info('');
  logger.info('Available browser projects:');
  for (const project of Object.values(browserProjects)) {
    logger.info(`  --project=${project.id}: ${project.name}`);
  }

  logger.info('');
  logger.info('Selection examples: --bu=CL,HLS --url=LNI | --bu=all --url=LNI | --bu=all --url=NJ,NVRCP | --bu=all --url=all | --tc=TC01,TC04 | --flow=all | --project=chromium,firefox');
}

function printRunPlan({ businessUnitIds, flows, testCases, environment, projectIds, workers }) {
  logger.section('Dry run plan');
  logger.info(`Business Units: ${businessUnitIds.join(', ')}`);
  logger.info(`Flows: ${flows.map((flow) => `${flow} (${getFlowInfo(flow).label})`).join(', ')}`);
  logger.info(`Test Cases: ${testCases.map((testCase) => testCase.id).join(', ')}`);
  logger.info(`URL: ${environment.id}`);
  logger.info(`Browsers: ${projectIds.join(', ')}`);
  logger.info(`Workers: ${workers}`);
  logger.info('');
  logger.info('Combinations to execute:');

  for (const flow of flows) {
    for (const businessUnitId of businessUnitIds) {
      const businessUnit = resolveBusinessUnit(businessUnitId);
      const applicableTestCases = testCases.filter((testCase) => (
        testCaseSupportsBusinessUnit(testCase, businessUnit)
      ));
      if (!applicableTestCases.length) {
        logger.info(`- SKIPPED | ${businessUnitId} | selected test cases are not configured`);
        continue;
      }

      for (const projectId of projectIds) {
        const project = resolveBrowserProject(projectId);
        const runEnvironment = resolveRunEnvironment({
          parsedArgs: args,
          runSettings,
          businessUnit,
        });
        logger.info(`- ${businessUnitId} | ${getFlowInfo(flow).label} | ${project.name} | ${runEnvironment.id} | ${runEnvironment.loginUrl} | ${applicableTestCases.map((testCase) => testCase.id).join(', ')}`);
      }
    }
  }
}

function printSummary(results, report, warnings, flowInfo) {
  logger.section(`Comparison summary - ${flowInfo.label}`);
  for (const result of results) {
    const status = result.comparison.passed ? 'PASS' : 'FAIL';
    const summary = result.comparison.summary;
    logger.info(
      `${result.id}: ${status} | expected=${summary.expected}, actual=${summary.actual}, matched=${summary.matched}, mismatch=${summary.mismatch}, missing=${summary.missing}, extra=${summary.extra}`,
    );
  }

  if (warnings.length) {
    logger.section('Warnings');
    warnings.forEach((warning) => logger.item(warning));
  }

  logger.info(`\nExcel report: ${report.excelPath}`);
  logger.info(`JSON report:  ${report.jsonPath}`);
}

async function saveFailureScreenshot(page, reportDir) {
  try {
    await fs.mkdir(reportDir, { recursive: true });
    const screenshotPath = path.join(reportDir, 'latest-failure.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return '';
  }
}
