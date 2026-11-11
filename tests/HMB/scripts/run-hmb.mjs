#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = require.resolve('@playwright/test/cli');
const reportDir = path.join(frameworkRoot, 'playwright-report');
const knownProjects = ['chromium', 'firefox', 'msedge'];
let TransactionNumber;
let loadApprovalCredentials;
let normalizeTransactionNumber;
const flowSpecs = [
  'tests/01_RegisterUser.spec.js',
  'tests/02_LoginApply.spec.js',
  'tests/03_ApproveApplication.spec.js',
];

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.reportOnly) {
    await openHtmlReport();
  } else if (options.serveReport) {
    await serveReport();
  } else {
    const [approvalConfig, transactionStore] = await Promise.all([
      import('../config/approvalTransacNumber.js'),
      import('../utils/transactionStore.js'),
    ]);
    ({ TransactionNumber, loadApprovalCredentials } = approvalConfig);
    ({ normalizeTransactionNumber } = transactionStore);
    const targets = options.projects.flatMap((project) => Array.from({ length: options.repeat }, (_, repeatIndex) => ({
      project,
      repeatIndex,
      runId: randomUUID(),
    })));
    const transactionNumber = resolveTransactionNumber(options);
    validateRun(options, targets, transactionNumber);

    if (options.listOnly) {
      for (const project of options.projects) {
        const result = spawnSync(process.execPath, [
          playwrightCli, 'test', '--config=playwright.config.js', '--workers=1', `--project=${project}`,
          '--list', ...options.playwrightArgs, ...options.specs,
        ], { cwd: frameworkRoot, stdio: 'inherit', env: { ...process.env } });
        if (result.status !== 0) process.exitCode = result.status ?? 1;
      }
    } else {
      const blobRoot = path.join(frameworkRoot, 'test-results', 'hmb-runs', randomUUID());
      const results = [];
      console.log(`HMB serial flow: ${options.specs.join(' -> ')}`);
      console.log(`Project(s): ${options.projects.join(', ')}; complete-flow repeats: ${options.repeat}`);

      for (const [targetIndex, target] of targets.entries()) {
        const result = await runTarget(target, targetIndex, options, transactionNumber, blobRoot);
        results.push(result);
        if (!result.passed) break;
      }

      const merged = mergeReports(blobRoot);
      if (!merged) results.push({ passed: false, label: 'Report merge' });
      if (runSettings.openHtmlReport && merged && process.env.ALIS_ECLIPSE_MANAGED_REPORT !== '1') {
        try {
          await openHtmlReport();
        } catch (error) {
          console.warn(`Playwright report was generated but could not be opened automatically: ${error.message}`);
          console.warn(`Open it manually with: npm run report`);
        }
      }

      const failed = results.filter((result) => !result.passed);
      if (failed.length) {
        console.error(`HMB run failed: ${failed.map((result) => result.label).join(', ')}`);
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error(`HMB configuration error: ${error.message}`);
  process.exitCode = 1;
}

async function runTarget(target, targetIndex, options, transactionNumber, blobRoot) {
  const label = `${target.project} / repeat ${target.repeatIndex + 1}`;
  const targetDir = path.join(blobRoot, `${targetIndex + 1}-${target.project}-r${target.repeatIndex + 1}`);
  const handoffDir = path.join(targetDir, 'handoff');
  const includesRegister = options.specs.includes(flowSpecs[0]);
  const includesApply = options.specs.includes(flowSpecs[1]);
  const includesApproval = options.specs.includes(flowSpecs[2]);
  const registrationPath = includesRegister && includesApply ? path.join(handoffDir, 'registration.json') : '';
  const targetEnv = {
    ...process.env,
    HMB_FLOW_RUN_ID: target.runId,
    HMB_FLOW_REPEAT: String(target.repeatIndex),
    HMB_LOGIN_SOURCE: registrationPath ? 'current-run' : 'standalone',
    HMB_REGISTRATION_PATH: registrationPath,
    HMB_TRANSACTION_PATH: path.join(handoffDir, 'transaction.json'),
    HMB_TRANSACTION_SOURCE: includesApply && includesApproval ? 'current-run' : 'standalone',
    HMB_TRANSACTION_NUMBER: includesApply ? '' : transactionNumber || '',
    HMB_TEST_RESULTS_DIR: path.join(targetDir, 'artifacts'),
    HMB_REPORT_DIR: path.join(targetDir, 'html-report'),
  };

  console.log(`\nStarting HMB flow: ${label}`);
  for (const [specIndex, spec] of options.specs.entries()) {
    const blobFile = path.join(blobRoot, 'blob-reports', `${targetIndex + 1}-${specIndex + 1}-${target.project}-r${target.repeatIndex + 1}.zip`);
    fs.mkdirSync(path.dirname(blobFile), { recursive: true });
    const commandArgs = [
      playwrightCli,
      'test',
      '--config=playwright.config.js',
      `--project=${target.project}`,
      '--workers=1',
      '--retries=0',
      '--reporter=blob,line',
      `--output=${path.join(targetDir, 'artifacts', path.basename(spec, '.spec.js'))}`,
      ...options.playwrightArgs,
      spec,
    ];
    console.log(`Running ${path.basename(spec)} for ${label}`);
    const result = await runChild(commandArgs, {
      cwd: frameworkRoot,
      env: { ...targetEnv, PLAYWRIGHT_BLOB_OUTPUT_FILE: blobFile },
      stdio: 'inherit',
    });
    if (registrationPath && (spec === flowSpecs[1] || result.status !== 0)) {
      try {
        fs.rmSync(registrationPath, { force: true });
      } catch (error) {
        console.warn(`Could not remove the temporary HMB registration handoff: ${error.message}`);
      }
    }
    if (result.status !== 0) {
      console.error(`HMB flow stopped at ${path.basename(spec)} for ${label}.`);
      return { ...target, label, passed: false };
    }
  }

  console.log(`Completed HMB flow: ${label}`);
  return { ...target, label, passed: true };
}

function parseArgs(args) {
  const selectedSpecs = [];
  const projects = [];
  const playwrightArgs = [];
  let repeat = 1;
  let listOnly = false;
  let reportOnly = false;
  let serveReportOnly = false;
  let rawTransaction = '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--list') { listOnly = true; continue; }
    if (arg === '--report') { reportOnly = true; continue; }
    if (arg === '--serve-report') { serveReportOnly = true; continue; }

    if (arg === '--spec' || arg === '--script') {
      addSpec(selectedSpecs, args[++index]);
      continue;
    }
    if (arg.startsWith('--spec=') || arg.startsWith('--script=')) {
      addSpec(selectedSpecs, arg.slice(arg.indexOf('=') + 1));
      continue;
    }

    if (arg === '--project') {
      while (args[index + 1] && !args[index + 1].startsWith('-')) {
        projects.push(...args[++index].split(',').filter(Boolean));
      }
      continue;
    }
    if (arg.startsWith('--project=')) {
      projects.push(...arg.slice('--project='.length).split(',').filter(Boolean));
      continue;
    }

    if (arg === '--repeat-each') {
      repeat = parsePositiveInt(args[++index], '--repeat-each');
      continue;
    }
    if (arg.startsWith('--repeat-each=')) {
      repeat = parsePositiveInt(arg.slice('--repeat-each='.length), '--repeat-each');
      continue;
    }
    if (arg === '--transaction' || arg === '--transaction-number') {
      rawTransaction = args[++index] ?? '';
      continue;
    }
    if (arg.startsWith('--transaction=') || arg.startsWith('--transaction-number=')) {
      rawTransaction = arg.slice(arg.indexOf('=') + 1);
      continue;
    }

    if (arg === '--workers' || arg.startsWith('--workers=') || arg === '--parallel' || arg.startsWith('--parallel=')) {
      throw new Error('HMB serial flow controls workers itself. Run separate browser projects with --project if needed.');
    }
    playwrightArgs.push(arg);
  }

  // npm consumes some --option values into npm_config_* instead of forwarding
  // them to argv when users invoke `npm run test --spec=... --headed`.
  if (!selectedSpecs.length && process.env.npm_config_spec && process.env.npm_config_spec !== 'true') {
    for (const spec of process.env.npm_config_spec.split(',')) addSpec(selectedSpecs, spec);
  }
  if (!projects.length && process.env.npm_config_project && process.env.npm_config_project !== 'true') {
    projects.push(...process.env.npm_config_project.split(',').filter(Boolean));
  }
  if (!rawTransaction && process.env.npm_config_transaction && process.env.npm_config_transaction !== 'true') {
    rawTransaction = process.env.npm_config_transaction;
  }
  if (repeat === 1 && process.env.npm_config_repeat_each) {
    repeat = parsePositiveInt(process.env.npm_config_repeat_each, '--repeat-each');
  }
  if (isTruthy(process.env.npm_config_headed) && !playwrightArgs.includes('--headed')) playwrightArgs.push('--headed');
  if (isTruthy(process.env.npm_config_list)) listOnly = true;

  const specs = selectedSpecs.length ? orderSpecs(selectedSpecs) : flowSpecs;
  const projectTargets = [...new Set(projects.length ? projects.map(normalizeProject) : [runSettings.defaultProject || 'chromium'])];
  for (const project of projectTargets) {
    if (!knownProjects.includes(project)) throw new Error(`Unknown HMB project "${project}". Use ${knownProjects.join(', ')}.`);
  }
  return {
    specs,
    projects: projectTargets,
    repeat,
    listOnly,
    reportOnly,
    serveReport: serveReportOnly,
    rawTransaction,
    playwrightArgs,
  };
}

function addSpec(selectedSpecs, value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/').toLowerCase();
  const aliases = {
    all: flowSpecs,
    e2e: flowSpecs,
    serial: flowSpecs,
    register: [flowSpecs[0]],
    registration: [flowSpecs[0]],
    '01': [flowSpecs[0]],
    '01_register': [flowSpecs[0]],
    registeruser: [flowSpecs[0]],
    '01_registeruser': [flowSpecs[0]],
    apply: [flowSpecs[1]],
    loginapply: [flowSpecs[1]],
    '02': [flowSpecs[1]],
    '02_loginapply': [flowSpecs[1]],
    approve: [flowSpecs[2]],
    approval: [flowSpecs[2]],
    '03': [flowSpecs[2]],
    '03_approveapplication': [flowSpecs[2]],
  };
  const key = path.basename(normalized).replace(/\.spec\.[cm]?[jt]s$/i, '').replace(/\.js$/i, '');
  const matched = aliases[normalized] || aliases[key];
  if (!matched) throw new Error(`Unknown HMB script "${value}". Choose register, apply, approve, or all.`);
  selectedSpecs.push(...matched);
}

function orderSpecs(specs) {
  return [...new Set(specs)].sort((left, right) => flowSpecs.indexOf(left) - flowSpecs.indexOf(right));
}

function normalizeProject(project) {
  const name = String(project).trim().toLowerCase();
  return name === 'edge' || name === 'microsoft edge' ? 'msedge' : name;
}

function parsePositiveInt(value, option) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`${option} must be a positive integer.`);
  return Number(value);
}

function resolveTransactionNumber(options) {
  const includesApproval = options.specs.includes(flowSpecs[2]);
  const includesApply = options.specs.includes(flowSpecs[1]);
  const selectedStandalone = includesApproval && !includesApply;
  const raw = options.rawTransaction || (selectedStandalone ? TransactionNumber : '');
  return raw ? normalizeTransactionNumber(raw) : '';
}

function validateRun(options, targets, transactionNumber) {
  if (options.listOnly) return;
  const includesApproval = options.specs.includes(flowSpecs[2]);
  const includesApply = options.specs.includes(flowSpecs[1]);
  if (transactionNumber && !includesApproval) throw new Error('A transaction number can only be used with --spec=approve.');
  if (includesApproval && includesApply && transactionNumber) {
    throw new Error('Register/Login-Apply/Approve uses the transaction captured by Script 02; omit the standalone transaction number.');
  }
  if (includesApproval && !includesApply) {
    if (!transactionNumber) throw new Error('Standalone approval requires TransactionNumber in config/approvalTransacNumber.js.');
    if (targets.length !== 1) throw new Error('Standalone approval must target one project and one repeat to prevent duplicate approvals.');
  }
  if (includesApply || includesApproval) {
    for (let index = 0; index < options.playwrightArgs.length; index += 1) {
      const arg = options.playwrightArgs[index];
      if (arg === '--retries' || arg.startsWith('--retries=')) {
        const value = arg === '--retries' ? options.playwrightArgs[index + 1] : arg.slice('--retries='.length);
        if (String(value) !== '0') throw new Error('HMB apply/approval requires --retries=0 to avoid repeating a submission or approval.');
      }
    }
  }
  if (includesApproval && !options.listOnly) {
    loadApprovalCredentials();
  }
}

function isTruthy(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value ?? ''));
}

function runChild(args, options) {
  return new Promise((resolveChild) => {
    const child = spawn(process.execPath, args, options);
    child.once('error', (error) => {
      console.error(`Could not start Playwright: ${error.message}`);
      resolveChild({ status: 1 });
    });
    child.once('close', (status) => resolveChild({ status: status ?? 1 }));
  });
}

function mergeReports(blobRoot) {
  const blobDir = path.join(blobRoot, 'blob-reports');
  if (!fs.existsSync(blobDir)) {
    console.warn('No HMB test artifacts were produced; skipping report merge.');
    return false;
  }
  const result = spawnSync(process.execPath, [playwrightCli, 'merge-reports', '--reporter=html,list', blobDir], {
    cwd: frameworkRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_HTML_OUTPUT_DIR: reportDir,
      PLAYWRIGHT_HTML_OPEN: 'never',
    },
  });
  return result.status === 0 && fs.existsSync(path.join(reportDir, 'index.html'));
}

async function openHtmlReport() {
  if (!fs.existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error(`Report index is missing: ${path.join(reportDir, 'index.html')}`);
  }

  const reportUrl = await startReportServer();
  await launchDefaultBrowser(reportUrl);
  console.log(`Opened Playwright report: ${reportUrl}`);
}

async function serveReport() {
  if (!fs.existsSync(path.join(reportDir, 'index.html'))) {
    throw new Error(`Report index is missing: ${path.join(reportDir, 'index.html')}`);
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  const reportRoot = path.resolve(reportDir);
  const reportPrefix = `${reportRoot}${path.sep}`;
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    let requestPath;
    try {
      requestPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^[/\\]+/, '');
    let filePath = path.resolve(reportRoot, relativePath);
    if (filePath !== reportRoot && !filePath.startsWith(reportPrefix)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError) {
        response.writeHead(404).end('Not found');
        return;
      }
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.stat(filePath, (indexError, fileStat) => {
        if (indexError || !fileStat.isFile()) {
          response.writeHead(404).end('Not found');
          return;
        }
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': fileStat.size,
          'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        fs.createReadStream(filePath).on('error', () => response.destroy()).pipe(response);
      });
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not determine the report server address.');
  console.log(`HMB_REPORT_URL=http://127.0.0.1:${address.port}/`);
}

function startReportServer() {
  return new Promise((resolveReport, rejectReport) => {
    const child = spawn(process.execPath, [path.join(frameworkRoot, 'scripts', 'run-hmb.mjs'), '--serve-report'], {
      cwd: frameworkRoot,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PLAYWRIGHT_HTML_OPEN: 'never' },
    });

    let output = '';
    let errorOutput = '';
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error(`Timed out starting Playwright's report server. ${errorOutput.slice(-1200)}`));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.removeListener('data', onStdout);
      child.stderr?.removeListener('data', onStderr);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      child.stdout?.destroy();
      child.stderr?.destroy();
      rejectReport(error);
    };
    const onStdout = (chunk) => {
      output += chunk.toString();
      const plainOutput = output.replace(/\u001b\[[0-9;]*m/g, '');
      const match = plainOutput.match(/HMB_REPORT_URL=(https?:\/\/[^\s]+)/i);
      if (!match || settled) return;

      const reportUrl = match[1].replace(/[.,;]+$/, '');
      let parsedUrl;
      try {
        parsedUrl = new URL(reportUrl);
      } catch {
        fail(new Error(`Playwright returned an invalid report URL: ${reportUrl}`));
        return;
      }
      if (parsedUrl.protocol !== 'http:' || parsedUrl.hostname !== '127.0.0.1' || !/^\d+$/.test(parsedUrl.port)) {
        fail(new Error(`Playwright returned an unexpected report URL: ${reportUrl}`));
        return;
      }

      settled = true;
      cleanup();
      child.unref();
      child.stdout?.on('error', () => {});
      child.stderr?.on('error', () => {});
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolveReport(parsedUrl.href);
    };
    const onStderr = (chunk) => { errorOutput += chunk.toString(); };
    const onError = (error) => fail(new Error(`Could not start Playwright report server: ${error.message}`));
    const onClose = (code) => {
      if (!settled) fail(new Error(`Playwright report server exited with code ${code}. ${errorOutput.slice(-1200)}`));
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
  });
}

function launchDefaultBrowser(url) {
  let executable;
  let args;
  if (process.platform === 'win32') {
    const safeUrl = new URL(url).href;
    executable = 'powershell.exe';
    args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${safeUrl}'`];
  } else if (process.platform === 'darwin') {
    executable = 'open';
    args = [url];
  } else {
    executable = 'xdg-open';
    args = [url];
  }

  return new Promise((resolveOpen, rejectOpen) => {
    const child = spawn(executable, args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', rejectOpen);
    child.once('close', (code) => {
      if (code === 0) resolveOpen();
      else rejectOpen(new Error(`Default browser launcher exited with code ${code}.`));
    });
  });
}

