import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const options = parseOptions(process.argv.slice(2), process.env);
const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = path.join(frameworkRoot, 'node_modules', 'playwright', 'cli.js');
const playwrightArgs = [playwrightCli, 'test', 'CompareSidebar.spec.js'];

if (options.list) {
  playwrightArgs.push('--list');
}

if (options.headed) {
  playwrightArgs.push('--headed');
}

if (options.project) {
  playwrightArgs.push(`--project=${options.project}`);
}

if (options.parallel) {
  playwrightArgs.push(`--workers=${options.parallel}`);
}

const env = {
  ...process.env,
  ...(options.products ? { PRODUCTS: options.products } : {}),
  ...(options.parallel ? { WORKERS: String(options.parallel), SIDEBAR_PARALLEL: 'true' } : {}),
};

const command = process.execPath;
const child = spawn(command, playwrightArgs, {
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function parseOptions(args, env) {
  const values = {
    products: readEnvOption(env, 'product') || readEnvOption(env, 'products') || '',
    headed: readEnvBoolean(env, 'headed'),
    list: readEnvBoolean(env, 'list'),
    parallel: readEnvOption(env, 'parallel') || '',
    parallelRequested: readEnvBoolean(env, 'parallel'),
    project: readEnvOption(env, 'project') || '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--headed') {
      values.headed = true;
      continue;
    }

    if (arg === '--list') {
      values.list = true;
      continue;
    }

    if (arg.startsWith('--product=')) {
      values.products = collectValue(arg.slice('--product='.length), args, index);
      index = skipCollectedValues(args, index);
      continue;
    }

    if (arg === '--product' || arg === '--products') {
      values.products = collectValue(args[index + 1] || '', args, index + 1);
      index = skipCollectedValues(args, index + 1);
      continue;
    }

    if (arg.startsWith('--products=')) {
      values.products = collectValue(arg.slice('--products='.length), args, index);
      index = skipCollectedValues(args, index);
      continue;
    }

    if (arg.startsWith('--parallel=')) {
      values.parallel = arg.slice('--parallel='.length);
      values.parallelRequested = true;
      continue;
    }

    if (arg === '--parallel') {
      values.parallelRequested = true;
      if (args[index + 1] && !args[index + 1].startsWith('--')) {
        values.parallel = args[index + 1];
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--project=')) {
      values.project = arg.slice('--project='.length);
      continue;
    }

    if (arg === '--project') {
      values.project = args[index + 1] || '';
      index += 1;
    }
  }

  if (!values.products) {
    values.products = args
      .filter((arg) => !String(arg).startsWith('--'))
      .filter((arg) => !/^\d+$/.test(String(arg).trim()))
      .join(' ');
  }

  if (!positiveInteger(values.parallel)) {
    values.parallel = args.find((arg) => /^\d+$/.test(String(arg).trim())) || '';
  }

  return {
    products: cleanProducts(values.products),
    headed: Boolean(values.headed),
    list: Boolean(values.list),
    parallel: positiveInteger(values.parallel) || (values.parallelRequested ? positiveInteger(runSettings.parallelWorkers) : 0),
    project: String(values.project || '').trim(),
  };
}

function collectValue(firstValue, args, startIndex) {
  const parts = [firstValue];

  for (let index = startIndex + 1; index < args.length; index += 1) {
    const nextArg = args[index];
    if (!nextArg || nextArg.startsWith('--')) break;
    parts.push(nextArg);
  }

  return parts.join(' ');
}

function skipCollectedValues(args, startIndex) {
  let index = startIndex;

  while (index + 1 < args.length && !args[index + 1].startsWith('--')) {
    index += 1;
  }

  return index;
}

function cleanProducts(value) {
  const raw = String(value || '').trim();
  const productNameMatches = raw.match(/product\s*\d+/gi);

  if (productNameMatches?.length) {
    return productNameMatches
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .join(',');
  }

  const separator = raw.includes(',') ? ',' : /\s+/;

  return raw
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',');
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readEnvOption(env, name) {
  return env[`npm_config_${name}`] || '';
}

function readEnvBoolean(env, name) {
  const value = env[`npm_config_${name}`];
  if (value === undefined) return false;
  return !['false', '0', 'no'].includes(String(value).trim().toLowerCase());
}
