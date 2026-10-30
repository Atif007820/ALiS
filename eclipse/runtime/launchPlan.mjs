import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const hmbSpecsByFlow = { E2E: '03_E2E', Apply: '02_LoginApply', Register: '01_Register' };
const conveyanceSpecsByFlow = { Apply: '02_LoginApply', Register: '01_RegisterUser' };

export function createLaunchPlan(framework, flow, environment = process.env) {
  if (!['HMB', 'Conveyance'].includes(framework) || !Object.hasOwn(hmbSpecsByFlow, flow)) {
    throw new Error('Select HMB or Conveyance with E2E, Apply or Register.');
  }
  const debug = environment.ALIS_ECLIPSE_MODE === 'debug';
  const cwd = path.join(projectRoot, 'tests', framework === 'HMB' ? 'HMB' : 'LNI/Conveyance');
  const require = createRequire(path.join(cwd, 'package.json'));
  const playwrightCli = require.resolve('@playwright/test/cli');
  const program = framework === 'HMB' ? playwrightCli : path.join(cwd, 'scripts/run-env.mjs');
  let args = framework === 'HMB'
    ? ['test', `tests/${hmbSpecsByFlow[flow]}.spec.js`, '--config=playwright.config.js', '--project=chromium', '--workers=1']
    : ['--parallel=1', '--', ...(flow === 'E2E' ? [] : [`testScripts/${conveyanceSpecsByFlow[flow]}.spec.js`]), '--project=chromium', '--workers=1'];
  const env = {
    ...environment,
    PLAYWRIGHT_HTML_OPEN: 'never',
    ALIS_ECLIPSE_MANAGED_REPORT: '1',
  };
  if (debug) {
    args.push('--headed', '--timeout=0', '--retries=0');
    env.HEADLESS = 'false';
  }
  return { framework, flow, debug, openReportAfterCompletion: true, cwd, program, args, env, playwrightCli,
    reportDir: path.resolve(cwd, framework === 'HMB' ? env.HMB_REPORT_DIR || 'playwright-report' : 'playwright-report') };
}

export function reportEnvironment(environment = process.env) {
  const env = { ...environment, PLAYWRIGHT_HTML_OPEN: 'always' };
  // A detached report viewer must not inherit the test debugger's bootloader.
  delete env.NODE_OPTIONS;
  delete env.VSCODE_INSPECTOR_OPTIONS;
  delete env.ALIS_ECLIPSE_MODE;
  delete env.ALIS_ECLIPSE_MANAGED_REPORT;
  return env;
}

export function createReportPlan(plan, startedAt, signal) {
  if (!plan.openReportAfterCompletion || signal) return null;
  const reportIndex = path.join(plan.reportDir, 'index.html');
  if (!fs.existsSync(reportIndex) || fs.statSync(reportIndex).mtimeMs < startedAt) return null;
  return {
    args: [plan.playwrightCli, 'show-report', plan.reportDir, '--host', '127.0.0.1', '--port', '0'],
    options: { cwd: plan.cwd, env: reportEnvironment(plan.env), detached: true, windowsHide: true, stdio: 'ignore' },
  };
}
