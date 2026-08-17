import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const frameworkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default function globalSetup() {
  const playwrightCli = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [playwrightCli, 'install', 'ffmpeg'], {
    cwd: frameworkRoot,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`Could not verify Playwright FFmpeg: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `Playwright FFmpeg installation failed with exit code ${result.status}. `
      + 'Run "npm run browsers:install" and retry.',
    );
  }
}
