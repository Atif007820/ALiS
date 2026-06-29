#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const env = { ...process.env };
const frameworkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runSettings = readRunSettings(frameworkRoot);
const passthrough = [];
let listOnly = false;
let headed = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const next = args[index + 1];

  if (arg === '--target' || arg === '--targets' || arg === '-t') {
    env.REGISTER_TARGETS = next;
    index += 1;
  } else if (arg.startsWith('--target=')) {
    env.REGISTER_TARGETS = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--targets=')) {
    env.REGISTER_TARGETS = arg.split('=').slice(1).join('=');
  } else if (arg === '--env' || arg === '--environment' || arg === '--environments' || arg === '-e') {
    env.REGISTER_ENVIRONMENTS = next;
    index += 1;
  } else if (arg.startsWith('--env=')) {
    env.REGISTER_ENVIRONMENTS = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--environment=')) {
    env.REGISTER_ENVIRONMENTS = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--environments=')) {
    env.REGISTER_ENVIRONMENTS = arg.split('=').slice(1).join('=');
  } else if (arg === '--site' || arg === '--sites' || arg === '-s') {
    env.REGISTER_SITES = next;
    index += 1;
  } else if (arg.startsWith('--site=')) {
    env.REGISTER_SITES = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--sites=')) {
    env.REGISTER_SITES = arg.split('=').slice(1).join('=');
  } else if (arg === '--product' || arg === '--products' || arg === '-p') {
    env.REGISTER_PRODUCTS = next;
    index += 1;
  } else if (arg.startsWith('--product=')) {
    env.REGISTER_PRODUCTS = arg.split('=').slice(1).join('=');
  } else if (arg.startsWith('--products=')) {
    env.REGISTER_PRODUCTS = arg.split('=').slice(1).join('=');
  } else if (arg === '--headed') {
    headed = true;
  } else if (arg === '--parallel') {
    env.REGISTER_FULLY_PARALLEL = 'true';
    if (next && !next.startsWith('-')) {
      env.REGISTER_WORKERS = next;
      index += 1;
    } else if (!env.REGISTER_WORKERS) {
      env.REGISTER_WORKERS = String(runSettings.parallelWorkers ?? runSettings.workers ?? 3);
    }
  } else if (arg === '--serial') {
    env.REGISTER_FULLY_PARALLEL = 'false';
    env.REGISTER_WORKERS = '1';
  } else if (arg === '--list') {
    listOnly = true;
  } else {
    passthrough.push(arg);
  }
}

if (headed) {
  env.HEADLESS = 'false';
}

const configPath = resolve(frameworkRoot, 'playwright.config.js');
const playwrightCli = findUp(frameworkRoot, 'node_modules/@playwright/test/cli.js');
const command = process.execPath;
const playwrightArgs = [playwrightCli, 'test', '-c', configPath];
const defaultProject = String(runSettings.defaultProject || '').trim();

if (defaultProject && !hasProjectArg(passthrough)) {
  playwrightArgs.push(`--project=${defaultProject}`);
}

if (!listOnly) cleanPreviousRunArtifacts(frameworkRoot);
mkdirSync(resolve(frameworkRoot, 'playwright-report'), { recursive: true });

if (listOnly) playwrightArgs.push('--list');
playwrightArgs.push(...passthrough);

const child = spawn(command, playwrightArgs, {
  cwd: frameworkRoot,
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

function findUp(startDirectory, relativePath) {
  let current = resolve(startDirectory);

  while (true) {
    const candidate = resolve(current, relativePath);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not find ${relativePath} from ${startDirectory}. Run npm install from the Playwright workspace root.`);
    }

    current = parent;
  }
}

function cleanPreviousRunArtifacts(rootDirectory) {
  const userDataDir = readRunSettings(rootDirectory).userDataDir || 'testData';
  const artifactDirs = ['test-results', 'playwright-report', userDataDir];

  for (const relativePath of artifactDirs) {
    if (!relativePath || relativePath === '.') continue;

    const target = resolve(rootDirectory, relativePath);
    assertInside(rootDirectory, target);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
  }
}

function readRunSettings(rootDirectory) {
  try {
    return JSON.parse(readFileSync(resolve(rootDirectory, 'config/runSettings.json'), 'utf-8'));
  } catch {
    return {};
  }
}

function hasProjectArg(values) {
  return values.some((value, index) => (
    value === '--project'
      || value.startsWith('--project=')
      || (index > 0 && values[index - 1] === '--project')
  ));
}

function assertInside(rootDirectory, targetDirectory) {
  const root = resolve(rootDirectory);
  const target = resolve(targetDirectory);

  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing to clean path outside framework root: ${target}`);
  }
}
