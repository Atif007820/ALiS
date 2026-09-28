import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getComparisonPairs } from '../config/comparisonConfig.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { parseOptions } from './cliOptions.js';

const frameworkRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

try {
  const options = parseOptions(process.argv.slice(2), process.env, runSettings);
  const pairs = getComparisonPairs({
    sites: options.sites,
    products: options.products,
    requireCredentials: !options.list,
  });
  console.log(`Selected comparisons (${pairs.length}): ${pairs.map((pair) => `${pair.site}/${pair.id}`).join(', ')}`);
  if (options.list) {
    const incomplete = pairs.filter((pair) => [pair.urlA, pair.urlB]
      .some((side) => !String(side.username).trim() || !String(side.password).trim()));
    if (incomplete.length) {
      console.log(`Credentials still needed: ${incomplete.map((pair) => `${pair.site}/${pair.id}`).join(', ')}`);
    }
  }

  const args = [require.resolve('@playwright/test/cli'), 'test', 'CompareSidebar.spec.js'];
  if (options.list) args.push('--list');
  if (options.headed === true) args.push('--headed');
  if (options.project) args.push(`--project=${options.project}`);
  if (options.parallel) args.push(`--workers=${options.parallel}`);

  const child = spawn(process.execPath, args, {
    cwd: frameworkRoot,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      ...(options.sites !== undefined ? { SITES: options.sites } : {}),
      ...(options.products !== undefined ? { PRODUCTS: options.products } : {}),
      SIDEBAR_LIST: String(options.list),
      ...(options.headed !== undefined ? { SIDEBAR_HEADED: String(options.headed) } : {}),
      ...(options.parallel ? { WORKERS: String(options.parallel), SIDEBAR_PARALLEL: 'true' } : {}),
    },
  });
  child.on('error', (error) => {
    console.error(`Could not start Playwright: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) console.error(`Playwright stopped with signal ${signal}.`);
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
