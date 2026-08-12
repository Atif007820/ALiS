import { CONFIG } from '../config/url.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const SIDEBAR_SIGNATURES = {
  angular: {
    containerSelectors: [
      '#dashboardSidebar',
      '#left-panel',
      'app-sidebar',
      'aside.sidebar',
      '.main-sidebar',
      '.sidebar',
      'nav.sidebar',
    ],
    menuItemSelectors: [
      '#left-panel ul.nav.navbar-nav li a',
      '#dashboardSidebar a',
      'app-sidebar a',
      'aside.sidebar a',
      '.main-sidebar a',
      '.sidebar a',
      'nav.sidebar a',
    ],
  },
  legacy: {
    containerSelectors: [
      'xpath=//div[@id="SecureMenu"]',
      '#SecureMenu',
      'table[id*="SecureMenu"]',
    ],
    menuItemSelectors: [
      'xpath=//div[@id="SecureMenu"]//a[contains(@class,"MenuAnchor")]',
      '#SecureMenu a.MenuAnchor',
      '#SecureMenu a',
      'a.MenuAnchor',
    ],
  },
};

const PAGE_GOTO_TIMEOUT = Number(runSettings.gotoTimeout || 60000);
const LOGIN_TIMEOUT = Number(runSettings.loginTimeout || 45000);
const SIDEBAR_TIMEOUT = Number(runSettings.sidebarTimeout || 45000);
const SIDEBAR_POLL_INTERVAL = Number(runSettings.sidebarPollInterval || 500);

async function detectAndScrape(page, label) {
  const started = Date.now();

  console.log(`   Detecting sidebar type on ${label}...`);
  const sidebarType = await detectSidebarType(page, label);

  console.log(`   Sidebar type detected: "${sidebarType}" on ${label} (${elapsed(started)})`);

  if (sidebarType === 'angular') {
    const menuSelector = await firstVisibleSelector(page, SIDEBAR_SIGNATURES.angular.menuItemSelectors, SIDEBAR_TIMEOUT);
    const items = await page.locator(menuSelector).evaluateAll(
      (anchors) =>
        anchors
          .map((a) => ({
            title: (a.getAttribute('title') || '').trim(),
            text: (a.querySelector('.menu-text')?.textContent || a.textContent || '').trim(),
            iconCode: (
              a.querySelector('.menu-icon, mat-icon, i, [class*="icon"]')?.textContent
              || a.querySelector('.menu-icon, mat-icon, i, [class*="icon"]')?.getAttribute('class')
              || ''
            ).trim(),
          }))
          .filter((item) => item.title || item.text),
    );

    return { items, sidebarType };
  }

  const menuSelector = await firstVisibleSelector(page, SIDEBAR_SIGNATURES.legacy.menuItemSelectors, SIDEBAR_TIMEOUT);
  const items = await page.locator(menuSelector).evaluateAll(
    (anchors) =>
      anchors
        .map((a) => {
          const text = (a.textContent || '').trim();
          return { title: text, text, iconCode: '' };
        })
        .filter((item) => item.title.length > 0),
  );

  return { items, sidebarType };
}

async function detectSidebarType(page, label) {
  const deadline = Date.now() + SIDEBAR_TIMEOUT;

  while (Date.now() < deadline) {
    const remaining = Math.max(250, Math.min(SIDEBAR_POLL_INTERVAL, deadline - Date.now()));
    const [angularVisible, legacyVisible] = await Promise.all([
      anyVisible(page, SIDEBAR_SIGNATURES.angular.containerSelectors, remaining),
      anyVisible(page, SIDEBAR_SIGNATURES.legacy.containerSelectors, remaining),
    ]);

    if (angularVisible) return 'angular';
    if (legacyVisible) return 'legacy';
  }

  const summary = await pageSummary(page);
  throw new Error(
    `Sidebar was not detected on ${label} within ${SIDEBAR_TIMEOUT} ms. `
      + `Current URL: ${summary.url}. Page title: ${summary.title}. Visible text: ${summary.text}`,
  );
}

export async function getSidebarItems(browser, env) {
  const started = Date.now();
  const { usernameField, passwordField, loginButton } = CONFIG.login;
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: runSettings.viewport ?? null,
  });
  const page = await context.newPage();

  page.setDefaultTimeout(Number(runSettings.defaultTimeout || 30000));
  page.setDefaultNavigationTimeout(PAGE_GOTO_TIMEOUT);

  try {
    console.log(`\nOpening ${env.label} -> ${env.loginUrl}`);
    await page.goto(env.loginUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT });
    console.log(`   ${env.label} login page loaded (${elapsed(started)})`);

    await selectBusinessUnitIfNeeded(page, env);
    await fillLoginCredentials(page, { usernameField, passwordField, username: env.username, password: env.password });
    await submitLogin(page, loginButton);
    console.log(`   ${env.label} login submitted (${elapsed(started)})`);
    await failFastOnLoginFailure(page, env.label);

    const { items, sidebarType } = await detectAndScrape(page, env.label);

    console.log(`   Found ${items.length} sidebar item(s) on ${env.label} [${sidebarType}] (${elapsed(started)})`);
    return items;
  } finally {
    await context.clearCookies().catch(() => {});
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    console.log(`   ${env.label} session closed (${elapsed(started)})`);
  }
}

async function selectBusinessUnitIfNeeded(page, env) {
  const modal = page.locator('#myModal').filter({ hasText: /select business unit/i }).first();
  if (!(await isVisible(modal, 1500))) return;

  const dropdown = page.locator('#ddlBusinessUnits2');
  const businessUnit = env.businessUnit || await firstBusinessUnitValue(dropdown);
  if (!businessUnit) {
    throw new Error(`Business unit modal is visible on ${env.label}, but no selectable business unit was found.`);
  }

  console.log(`   Selecting business unit "${businessUnit}" on ${env.label}.`);
  await dropdown.selectOption(businessUnit, { timeout: 5000 });
  await checkBusinessUnitMessageIfVisible(page, env.label);

  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: LOGIN_TIMEOUT }).catch(() => null);
  await page.locator('#btnOk').evaluate((element) => element.click());
  await navigation;
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function checkBusinessUnitMessageIfVisible(page, label) {
  const checkbox = page.locator('#chkMessage');
  if (!(await isVisible(checkbox, 1500))) return;

  const checked = await checkbox.isChecked().catch(() => false);
  if (checked) return;

  try {
    await checkbox.check({ timeout: 3000, force: true });
  } catch {
    await checkbox.evaluate((element) => {
      element.checked = true;
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  console.log(`   Checked business unit message checkbox on ${label}.`);
}

async function firstBusinessUnitValue(dropdown) {
  return dropdown
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value).find((value) => value))
    .catch(() => '');
}

async function fillLoginCredentials(page, { usernameField, passwordField, username, password }) {
  await fillLoginField(page, 'Login Name', username, [
    page.getByRole('textbox', { name: usernameField }),
    page.getByLabel(usernameField),
    page.locator('#m_LoginControl_UserName'),
    page.locator('input[name="m_LoginControl$UserName"]'),
    page.locator('input[id$="_UserName"]'),
    page.locator('input[name$="$UserName"]'),
  ]);

  await fillLoginField(page, 'Password', password, [
    page.getByLabel(passwordField),
    page.getByRole('textbox', { name: passwordField }),
    page.locator('#m_LoginControl_Password'),
    page.locator('input[name="m_LoginControl$Password"]'),
    page.locator('input[id$="_Password"]'),
    page.locator('input[name$="$Password"]'),
    page.locator('input[type="password"]'),
  ]);
}

async function fillLoginField(page, label, value, locators) {
  for (const locator of locators) {
    const field = locator.first();
    if (!(await isVisible(field, 1500))) continue;

    const state = await field.evaluate((element) => ({
      disabled: Boolean(element.disabled),
      readonly: Boolean(element.readOnly || element.getAttribute('readonly') !== null),
    })).catch(() => ({ disabled: true, readonly: true }));

    if (!state.disabled && !state.readonly) {
      await field.fill(value, { timeout: 5000 });
      return;
    }

    await field.evaluate((element, inputValue) => {
      element.removeAttribute('readonly');
      element.readOnly = false;
      element.disabled = false;
      element.removeAttribute('disabled');
      element.value = inputValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }, value);

    console.log(`   Filled ${label} after unlocking readonly login field.`);
    return;
  }

  const summary = await pageSummary(page);
  throw new Error(`Could not find visible ${label} field. Current URL: ${summary.url}. Visible text: ${summary.text}`);
}

async function submitLogin(page, loginButton) {
  const loginLocator = page
    .getByRole('button', { name: loginButton, exact: true })
    .or(page.getByRole('link', { name: loginButton, exact: true }))
    .or(page.getByText(loginButton, { exact: true }))
    .first();

  await dismissBlockingOverlays(page);

  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: LOGIN_TIMEOUT }).catch(() => null);

  try {
    await loginLocator.click({ timeout: Math.min(LOGIN_TIMEOUT, 5000) });
  } catch (error) {
    await dismissBlockingOverlays(page);
    console.log(`   Normal Login click was blocked; retrying with force. ${error.message.split('\n')[0]}`);
    await loginLocator.click({ timeout: Math.min(LOGIN_TIMEOUT, 5000), force: true });
  }

  await navigation;

  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
}

async function failFastOnLoginFailure(page, label) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const failurePatterns = [
    /user does not exist in the database or the user status is inactive/i,
    /invalid login/i,
    /invalid login name/i,
    /invalid username/i,
    /invalid password/i,
    /login failed/i,
    /account is inactive/i,
    /user status is inactive/i,
    /password is incorrect/i,
    /credentials.*invalid/i,
  ];
  const matchedFailure = failurePatterns.find((pattern) => pattern.test(normalizedText));

  if (!matchedFailure) return;

  const failureText = normalizedText.match(matchedFailure)?.[0] || 'Login was rejected by the application.';
  const summary = await pageSummary(page);
  throw new Error(
    `Login failed on ${label}: ${failureText}. `
      + `Current URL: ${summary.url}. Visible text: ${summary.text}`,
  );
}

async function dismissBlockingOverlays(page) {
  await page.evaluate(() => {
    const selectors = [
      '#myModal',
      '.modal-backdrop',
      '.blockUI',
      '.blockOverlay',
      '.ui-widget-overlay',
      '[data-showbusycursor]',
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (element.matches?.('[data-showbusycursor]')) continue;
        element.classList?.remove('show', 'in');
        element.style.pointerEvents = 'none';
        element.style.display = 'none';
        element.style.visibility = 'hidden';
      }
    }

    document.body?.classList?.remove('modal-open');
    if (document.body) {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
  }).catch(() => {});
}

async function isVisible(locator, timeout) {
  return locator.first().waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function anyVisible(page, selectors, timeout) {
  const results = await Promise.all(
    selectors.map((selector) => isVisible(page.locator(selector), timeout)),
  );

  return results.some(Boolean);
}

async function firstVisibleSelector(page, selectors, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const remaining = Math.max(250, Math.min(SIDEBAR_POLL_INTERVAL, deadline - Date.now()));

    for (const selector of selectors) {
      const locator = page.locator(selector);
      if (await hasVisibleItems(locator, remaining)) {
        return selector;
      }
    }
  }

  throw new Error(`No visible sidebar menu item selector matched. Tried: ${selectors.join(', ')}`);
}

async function hasVisibleItems(locator, timeout) {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(async () => (await locator.count()) > 0)
    .catch(() => false);
}

async function pageSummary(page) {
  const [url, title, text] = await Promise.all([
    Promise.resolve(page.url()).catch(() => ''),
    page.title().catch(() => ''),
    page.locator('body').innerText({ timeout: 2000 }).catch(() => ''),
  ]);

  return {
    url,
    title,
    text: text.replace(/\s+/g, ' ').trim().slice(0, 700),
  };
}

function elapsed(started) {
  return `${((Date.now() - started) / 1000).toFixed(1)}s`;
}
