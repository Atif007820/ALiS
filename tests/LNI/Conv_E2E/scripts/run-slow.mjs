import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const userArgs = process.argv.slice(2);
const args = [playwrightCli, 'test', ...userArgs, '--project=chromium', '--headed'];

console.log('Running Playwright with slowMo from config/runSettings.json');

const result = spawnSync(process.execPath, args, {
  env: {
    ...process.env,
    HEADLESS: 'false',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
