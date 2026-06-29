import { waitForAppIdle } from './navigation.js';
import { clickFirstVisible } from '../utils/uiActions.js';
import { baselineConfig } from '../config/baseline.config.js';
import { waitForPageTimeout } from '../utils/pageGuards.js';

export async function login(page, { environment, credentials }) {
  await gotoLogin(page, environment.loginUrl);

  const loginName = page.getByRole('textbox', { name: 'Login Name' });

  const loginVisible = await loginName
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (!loginVisible) {
    await waitForAppIdle(page);
    return;
  }

  await loginName.fill(credentials.username);
  const password = page.getByRole('textbox', { name: 'Password' });
  await password.fill(credentials.password);

  const clickedLogin = await clickFirstVisible(page, [
    (currentPage) => currentPage.getByRole('link', { name: 'Login', exact: true }).first(),
    (currentPage) => currentPage.getByRole('button', { name: 'Login', exact: true }).first(),
  ]);

  if (!clickedLogin) {
    await password.press('Enter');
  }

  await waitForAppIdle(page);
}

async function gotoLogin(page, loginUrl) {
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: baselineConfig.timeouts.navigationMs,
      });
      return;
    } catch (error) {
      if (attempt === attempts || !isRetryableNavigationError(error)) {
        throw error;
      }

      await waitForPageTimeout(page, 1000, 'login retry delay');
    }
  }
}

function isRetryableNavigationError(error) {
  return /Timeout|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_ABORTED|ERR_TIMED_OUT/i.test(error.message || '');
}
