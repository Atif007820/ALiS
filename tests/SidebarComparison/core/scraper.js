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
const NAVIGATION_RETRIES = Number.isSafeInteger(runSettings.navigationRetries) && runSettings.navigationRetries >= 0
  ? runSettings.navigationRetries : 1;
const LOGIN_TIMEOUT = Number(runSettings.loginTimeout || 45000);
const SIDEBAR_TIMEOUT = Number(runSettings.sidebarTimeout || 45000);
const SIDEBAR_POLL_INTERVAL = Number(runSettings.sidebarPollInterval || 500);
const SIDEBAR_STABLE_MS = Number(runSettings.sidebarStableMs ?? 1000);
if (!Number.isFinite(SIDEBAR_STABLE_MS) || SIDEBAR_STABLE_MS < 0) {
  throw new Error('config/runSettings.json > sidebarStableMs must be a non-negative number.');
}

async function detectAndScrape(page, label) {
  const started = Date.now();
  const deadline = started + SIDEBAR_TIMEOUT;

  console.log(`   Detecting sidebar type on ${label}...`);
  const sidebarType = await detectSidebarType(page, label, deadline);

  console.log(`   Sidebar type detected: "${sidebarType}" on ${label} (${elapsed(started)})`);

  const menuSelector = await firstVisibleSelector(
    page, SIDEBAR_SIGNATURES[sidebarType].menuItemSelectors, Math.max(1, deadline - Date.now()),
  );
  let previous = '';
  let stableSince = 0;
  while (Date.now() < deadline) {
    await failFastOnLoginFailure(page, label);
    const items = await scrapeItems(page, sidebarType, menuSelector).catch(() => []);
    const signature = JSON.stringify(items);
    const busy = await pageIsBusy(page);
    if (!items.length || busy || signature !== previous) stableSince = Date.now();
    if (items.length && !busy && signature === previous && Date.now() - stableSince >= SIDEBAR_STABLE_MS) {
      return { items, sidebarType };
    }
    previous = signature;
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Sidebar content did not stabilize on ${label} within ${SIDEBAR_TIMEOUT} ms. Current URL: ${page.url()}`);
}

async function scrapeItems(page, sidebarType, menuSelector) {
  if (sidebarType === 'angular') {
    return page.locator(menuSelector).evaluateAll(
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
  }

  return page.locator(menuSelector).evaluateAll(
    (anchors) =>
      anchors
        .map((a) => {
          const text = (a.textContent || '').trim();
          return { title: text, text, iconCode: '' };
        })
        .filter((item) => item.title.length > 0),
  );
}

async function detectSidebarType(page, label, deadline) {
  while (Date.now() < deadline) {
    await failFastOnLoginFailure(page, label);
    const [angularVisible, legacyVisible] = await Promise.all([
      anyVisible(page, SIDEBAR_SIGNATURES.angular.containerSelectors),
      anyVisible(page, SIDEBAR_SIGNATURES.legacy.containerSelectors),
    ]);

    if (angularVisible) return 'angular';
    if (legacyVisible) return 'legacy';
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }

  const summary = await pageSummary(page);
  throw new Error(
    `Sidebar was not detected on ${label} within ${SIDEBAR_TIMEOUT} ms. `
      + `Current URL: ${summary.url}. Page title: ${summary.title}. Visible text: ${summary.text}`,
  );
}

export async function getSidebarItems(browser, env, { testInfo, side = 'session' } = {}) {
  const started = Date.now();
  const { usernameField, passwordField, loginButton } = env.login;
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: runSettings.viewport ?? null,
  });
  let page;
  let tracing = false;

  try {
    if (testInfo && runSettings.retainSessionTraceOnFailure !== false) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
    }
    page = await context.newPage();
    page.setDefaultTimeout(Number(runSettings.defaultTimeout || 30000));
    page.setDefaultNavigationTimeout(PAGE_GOTO_TIMEOUT);
    console.log(`\nOpening ${env.label} -> ${env.loginUrl}`);
    await openLoginPage(page, env);
    console.log(`   ${env.label} login page loaded (${elapsed(started)})`);

    await selectBusinessUnitIfNeeded(page, env);
    await fillLoginCredentials(page, { usernameField, passwordField, username: env.username, password: env.password });
    await submitLogin(page, loginButton);
    console.log(`   ${env.label} login submitted (${elapsed(started)})`);
    await failFastOnLoginFailure(page, env.label);

    const { items, sidebarType } = await detectAndScrape(page, env.label);

    console.log(`   Found ${items.length} sidebar item(s) on ${env.label} [${sidebarType}] (${elapsed(started)})`);
    return items;
  } catch (error) {
    if (testInfo) {
      const artifactSide = String(side).replace(/[^a-zA-Z0-9_-]/g, '_');
      if (page && !page.isClosed()) {
        const screenshot = await page.screenshot({ fullPage: true, timeout: 5000 }).catch(() => null);
        if (screenshot) await testInfo.attach(`URL ${side} failure screenshot`, {
          body: screenshot, contentType: 'image/png',
        }).catch(() => {});
      }
      if (tracing) {
        const tracePath = testInfo.outputPath(`url-${artifactSide}-trace.zip`);
        await context.tracing.stop({ path: tracePath })
          .then(() => testInfo.attach(`URL ${side} trace`, { path: tracePath, contentType: 'application/zip' }))
          .catch(() => {});
        tracing = false;
      }
    }
    throw error;
  } finally {
    if (tracing) await context.tracing.stop().catch(() => {});
    await context.clearCookies().catch(() => {});
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
    console.log(`   ${env.label} session closed (${elapsed(started)})`);
  }
}

// Retry only the initial GET navigation; never repeat credential submissions.
export async function openLoginPage(page, { loginUrl, label }, {
  retries = NAVIGATION_RETRIES,
  timeout = PAGE_GOTO_TIMEOUT,
} = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout });
      if (response && response.status() >= 400) {
        throw new Error(`Could not load ${label}: HTTP ${response.status()} ${response.statusText()}. URL: ${page.url()}`);
      }
      return response;
    } catch (error) {
      const transient = error.name === 'TimeoutError'
        || /net::ERR_(NETWORK_CHANGED|NETWORK_IO_SUSPENDED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_TIMED_OUT|TIMED_OUT)\b/.test(error.message);
      if (!transient || attempt >= retries) throw error;
      console.log(`   Retrying ${label} page load (${attempt + 1}/${retries}): ${error.message.split('\n')[0]}`);
    }
  }
}

async function selectBusinessUnitIfNeeded(page, env) {
  const modal = page.locator('#myModal').filter({ has: page.locator('#ddlBusinessUnits2') }).first();
  const deadline = Date.now() + LOGIN_TIMEOUT;
  while (Date.now() < deadline) {
    if (await modal.isVisible().catch(() => false)) {
      await selectBusinessUnit(page, env, modal, deadline);
    }
    if (!await pageIsBusy(page)) {
      const fields = loginFieldLocators(page, env.login);
      const [username, password] = await Promise.all([
        editableField(fields.username), editableField(fields.password),
      ]);
      if (username && password && !await modal.isVisible().catch(() => false)) return;
    }
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Login form was not ready on ${env.label} within ${LOGIN_TIMEOUT} ms; required business-unit selection or read-only fields did not finish initializing. Current URL: ${page.url()}`);
}

async function selectBusinessUnit(page, env, modal, deadline) {
  const remaining = () => Math.max(1, deadline - Date.now());
  const dropdown = modal.locator('#ddlBusinessUnits2');
  const businessUnit = env.businessUnit || await firstBusinessUnitValue(page, dropdown, deadline);
  if (!businessUnit) {
    throw new Error(`Business unit modal is visible on ${env.label}, but no selectable business unit was found.`);
  }

  console.log(`   Selecting business unit "${businessUnit}" on ${env.label}.`);
  await dropdown.selectOption(businessUnit, { timeout: remaining() });
  if (!await modal.isVisible().catch(() => false)) return;
  await checkBusinessUnitMessageIfVisible(modal, env.label, remaining());
  if (!await modal.isVisible().catch(() => false)) return;

  try {
    await modal.locator('#btnOk').click({ timeout: remaining(), noWaitAfter: true });
  } catch (error) {
    // A legacy postback can already have accepted the modal while the click was waiting.
    if (await modal.isVisible().catch(() => false)) throw error;
  }
  await modal.waitFor({ state: 'hidden', timeout: remaining() });
}

async function checkBusinessUnitMessageIfVisible(modal, label, timeout) {
  const checkbox = modal.locator('#chkMessage');
  if (!await checkbox.isVisible().catch(() => false)) return;

  const checked = await checkbox.isChecked().catch(() => false);
  if (checked) return;

  try {
    await checkbox.check({ timeout: Math.min(3000, timeout) });
  } catch (error) {
    if (!await modal.isVisible().catch(() => false)) return;
    if (!await checkbox.isVisible().catch(() => false)) throw error;
    // Some legacy modal layouts clip this checkbox; run its real handler without toggling twice.
    await checkbox.evaluate((element) => {
      if (!element.checked && !element.disabled) element.click();
    });
  }

  console.log(`   Checked business unit message checkbox on ${label}.`);
}

async function firstBusinessUnitValue(page, dropdown, deadline) {
  while (Date.now() < deadline) {
    const value = await dropdown.locator('option')
      .evaluateAll((options) => options.map((option) => option.value).find((value) => value))
      .catch(() => '');
    if (value) return value;
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }
  return '';
}

function loginFieldLocators(page, { usernameField, passwordField }) {
  return {
    username: [
      page.getByRole('textbox', { name: usernameField }),
      page.getByLabel(usernameField),
      page.locator('#m_LoginControl_UserName'),
      page.locator('input[name="m_LoginControl$UserName"]'),
      page.locator('input[id$="_UserName"]'),
      page.locator('input[name$="$UserName"]'),
    ],
    password: [
      page.getByLabel(passwordField),
      page.getByRole('textbox', { name: passwordField }),
      page.locator('#m_LoginControl_Password'),
      page.locator('input[name="m_LoginControl$Password"]'),
      page.locator('input[id$="_Password"]'),
      page.locator('input[name$="$Password"]'),
      page.locator('input[type="password"]'),
    ],
  };
}

async function editableField(locators) {
  for (const locator of locators) {
    const field = locator.first();
    if (!await field.isVisible().catch(() => false)) continue;
    if (await field.isEditable().catch(() => false)) return field;

    // Some login pages remove their autofill lock on focus; use the real focus handler.
    const focusUnlock = await field.evaluate((element) => element.readOnly && !element.disabled).catch(() => false);
    if (focusUnlock) {
      await field.click({ timeout: 1000 }).catch(() => {});
      if (await field.isEditable().catch(() => false)) return field;
    }
  }
  return null;
}

async function fillLoginCredentials(page, env) {
  const fields = loginFieldLocators(page, env);
  await fillLoginField(page, 'Login Name', env.username, fields.username);
  await fillLoginField(page, 'Password', env.password, fields.password);
}

async function fillLoginField(page, label, value, locators) {
  const deadline = Date.now() + LOGIN_TIMEOUT;
  while (Date.now() < deadline) {
    const field = await editableField(locators);
    if (field) {
      await field.fill(value, { timeout: Math.max(1, deadline - Date.now()) });
      return;
    }
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }
  const summary = await pageSummary(page);
  throw new Error('Could not find an editable ' + label + ' field. Current URL: ' + summary.url + '. Visible text: ' + summary.text);
}

async function submitLogin(page, loginButton) {
  const loginLocator = page
    .getByRole('button', { name: loginButton, exact: true })
    .or(page.getByRole('link', { name: loginButton, exact: true }))
    .or(page.getByText(loginButton, { exact: true }))
    .first();

  // Submit once. Sidebar detection observes both navigation and SPA login completion.
  await loginLocator.click({ timeout: LOGIN_TIMEOUT, noWaitAfter: true });
}

async function failFastOnLoginFailure(page, label) {
  const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
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

async function pageIsBusy(page) {
  return page.evaluate(() => {
    try {
      if (window.Sys?.WebForms?.PageRequestManager?.getInstance?.()?.get_isInAsyncPostBack?.()) return true;
    } catch {}
    return Array.from(document.querySelectorAll(
      '.blockOverlay, .ui-widget-overlay, .loading-spinner, .spinner-border, .loading-mask, [aria-busy="true"], [data-loading="true"]',
    )).some((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    });
  }).catch(() => true);
}

async function anyVisible(page, selectors) {
  const results = await Promise.all(
    selectors.map((selector) => page.locator(selector).first().isVisible().catch(() => false)),
  );

  return results.some(Boolean);
}

async function firstVisibleSelector(page, selectors, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector);
      if (await hasVisibleItems(locator)) {
        return selector;
      }
    }
    await page.waitForTimeout(Math.min(SIDEBAR_POLL_INTERVAL, Math.max(1, deadline - Date.now())));
  }

  throw new Error(`No visible sidebar menu item selector matched. Tried: ${selectors.join(', ')}`);
}

async function hasVisibleItems(locator) {
  return locator.first().isVisible().catch(() => false);
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
