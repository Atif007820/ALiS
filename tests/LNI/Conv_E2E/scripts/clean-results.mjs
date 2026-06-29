// scripts/clean-results.mjs
import { existsSync } from 'fs';
import { rm } from 'fs/promises';

const dirs = [
  'playwright-report',
  'test-results',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeWithRetry(dir) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      console.log(`  Removed ${dir}/`);
      return;
    } catch (error) {
      const isWindowsLock = ['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code);
      if (!isWindowsLock || attempt === maxAttempts) {
        console.warn(`  Warning: could not fully remove ${dir}/ (${error.code ?? error.message}). Continuing.`);
        return;
      }

      await sleep(750);
    }
  }
}

console.log('Cleaning previous test artifacts...');

for (const dir of dirs) {
  if (existsSync(dir)) {
    await removeWithRetry(dir);
  }
}

console.log('Clean complete.\n');
