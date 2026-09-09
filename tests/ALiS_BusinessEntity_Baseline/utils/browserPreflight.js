import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const installerNames = {
  chromium: 'chromium',
  firefox: 'firefox',
  msedge: 'msedge',
};

export function ensurePlaywrightBrowsers(projectIds, { cwd, logger }) {
  const browsers = [...new Set(
    projectIds
      .map((projectId) => installerNames[String(projectId).toLowerCase()])
      .filter(Boolean),
  )];

  if (!browsers.length) return;

  logger.info(`Verifying Playwright browser dependencies: ${browsers.join(', ')}`);

  const playwrightCli = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [playwrightCli, 'install', ...browsers], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`Could not verify Playwright browsers: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `Playwright browser verification failed with exit code ${result.status}. `
      + 'Check network access or run "npm run browsers:install" from the framework folder.',
    );
  }
}
