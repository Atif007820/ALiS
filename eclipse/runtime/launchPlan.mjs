import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const frameworks = {
  HMB: {
    packageDir: 'tests/HMB',
    scripts: { E2E: 'hmb', Apply: 'hmb:apply', Register: 'hmb:register' },
    args: ['--project=chromium'],
    reportScript: 'report',
  },
  Conveyance: {
    packageDir: 'tests/LNI/Conveyance',
    scripts: { E2E: 'conv', Apply: 'test:apply', Register: 'test:register' },
    args: ['--project=chromium', '--parallel=1'],
  },
};

export function createLaunchPlan(selection, environment = process.env) {
  const { framework, flow, scriptArgs = [], debugArgs = [] } = selection;
  let { packageDir, script } = selection;
  let frameworkArgs = [];
  const savedFlow = framework !== undefined || flow !== undefined;
  if (savedFlow) {
    if (packageDir !== undefined || script !== undefined) {
      throw new Error('Choose either --framework and --flow or --package and --script.');
    }
    const config = Object.hasOwn(frameworks, framework) ? frameworks[framework] : undefined;
    if (!config || !Object.hasOwn(config.scripts, flow)) {
      throw new Error(`Unknown Eclipse flow "${framework} - ${flow}". Select a saved flow or use --package and --script.`);
    }
    packageDir = config.packageDir;
    script = config.scripts[flow];
    frameworkArgs = config.args;
  } else if (!packageDir || !script) {
    throw new Error('Provide --package=<project-relative directory> and --script=<npm script name>.');
  }

  const cwd = path.resolve(projectRoot, packageDir);
  const relative = path.relative(projectRoot, cwd);
  if (path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') {
    throw new Error(`Eclipse package directory must be inside the Playwright project: ${packageDir}`);
  }
  const manifestPath = path.join(cwd, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (script.startsWith('-') || !Object.hasOwn(manifest.scripts ?? {}, script)
    || typeof manifest.scripts[script] !== 'string' || !manifest.scripts[script].trim()) {
    throw new Error(`npm script "${script}" is missing from ${manifestPath}.`);
  }

  const debug = environment.ALIS_ECLIPSE_MODE === 'debug';
  const forwarded = [...frameworkArgs, ...scriptArgs];
  if (debug) {
    if (savedFlow) forwarded.push('--headed', '--timeout=0', '--retries=0');
    forwarded.push(...debugArgs);
  }
  const args = ['run', script, ...(forwarded.length ? ['--', ...forwarded] : [])];
  const env = { ...environment };
  const reportConfig = Object.values(frameworks).find(config => path.resolve(projectRoot, config.packageDir) === cwd);
  const openReportAfterCompletion = Boolean(reportConfig) && !forwarded.includes('--list');
  if (openReportAfterCompletion) {
    env.PLAYWRIGHT_HTML_OPEN = 'never';
    env.ALIS_ECLIPSE_MANAGED_REPORT = '1';
  }
  if (debug) env.HEADLESS = 'false';

  return {
    name: savedFlow ? `${framework} - ${flow}` : `${packageDir} - ${script}`,
    framework, flow, script, debug, openReportAfterCompletion, cwd, args, env,
    program: resolveNpmCli(environment),
    reportDir: path.join(cwd, 'playwright-report'),
    reportScript: reportConfig?.reportScript,
  };
}

function resolveNpmCli(environment) {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    environment.npm_execpath,
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, 'npm'),
  ];
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const resolved = fs.realpathSync(candidate);
    if (path.basename(resolved) === 'npm-cli.js' && fs.statSync(resolved).isFile()) return resolved;
  }
  throw new Error(`Cannot find npm for Node at ${process.execPath}. Select a Node.js installation with npm in the Eclipse launch parameters.`);
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
  const args = plan.reportScript
    ? [plan.program, 'run', plan.reportScript]
    : [createRequire(path.join(plan.cwd, 'package.json')).resolve('@playwright/test/cli'),
      'show-report', plan.reportDir, '--host', '127.0.0.1', '--port', '0'];
  return {
    args,
    options: { cwd: plan.cwd, env: reportEnvironment(plan.env), detached: true, windowsHide: true, stdio: 'ignore' },
  };
}
