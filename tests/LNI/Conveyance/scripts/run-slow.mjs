import { spawnSync } from 'child_process';
import { fileURLToPath } from 'node:url';

const runScript = fileURLToPath(new URL('./run-conveyance.mjs', import.meta.url));
const userArgs = process.argv.slice(2);
const args = [runScript, ...userArgs, '--headed'];

console.log('Running Playwright with slowMo from config/runSettings.json');

const result = spawnSync(process.execPath, args, {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: {
    ...process.env,
    HEADLESS: 'false',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
