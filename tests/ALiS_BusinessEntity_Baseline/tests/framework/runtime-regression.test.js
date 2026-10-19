import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { saveCreatedEntity } from '../../flows/CreateEntityFlow.js';
import { runUiActions } from '../../utils/uiActions.js';
import { buildSearchAttempts } from '../../flows/ModifySearchFlow.js';
import { assertPageAccess, isClosedPageError, isTransientNavigationError, trackNavigationFailures } from '../../utils/pageGuards.js';

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

test('create flow accepts an already-persisted success page without requiring Save', async () => {
  const page = await browser.newPage();
  await page.setContent(`
    <main>
      <h1>Business Entity has been saved successfully as per following details.</h1>
      <div>Licensee Id: 78409</div>
    </main>
  `);

  await assert.doesNotReject(() => saveCreatedEntity(page, { createSaveAttempts: 1 }));
  await page.close();
});

test('create flow can activate an image-based Save control', async () => {
  const page = await browser.newPage();
  await page.setContent(`
    <input
      id="save"
      type="image"
      alt="Save"
      title="Save"
      style="width: 80px; height: 24px"
      onclick="document.body.innerHTML = '<h1>Business Entity has been saved successfully</h1>'"
    >
  `);

  let saveCheckpoints = 0;
  await saveCreatedEntity(page, { createSaveAttempts: 1 }, {
    onSaveAttempt: () => { saveCheckpoints += 1; },
  });
  assert.equal(saveCheckpoints, 1);
  assert.match(await page.locator('body').innerText(), /saved successfully/i);
  await page.close();
});

test('an Access Denied page reports authorization failure before attempting another Save', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<h1>Access Denied</h1><p>You do not have permissions to access this functionality</p>');
    let attempts = 0;
    await assert.rejects(() => saveCreatedEntity(page, { createSaveAttempts: 2 }, {
      onSaveAttempt: () => { attempts += 1; },
    }), /ALiS denied access/);
    assert.equal(attempts, 0);
  } finally {
    await page.close();
  }
});

test('radio option matching recognizes text in an adjacent legacy table cell', async () => {
  const page = await browser.newPage();
  await page.setContent(`
    <table>
      <tbody>
        <tr>
          <td><input id="credentialType" type="radio" name="credential" value="provider"></td>
          <td><span>BUSINESS THAT PROVIDES HEALTH FACILITY SERVICES</span></td>
        </tr>
        <tr>
          <td><input id="otherType" type="radio" name="credential" value="other"></td>
          <td><span>BUSINESS THAT DOES NOT PROVIDE SERVICES</span></td>
        </tr>
      </tbody>
    </table>
  `);

  await runUiActions(page, [{ type: 'radio', name: 'BUSINESS THAT PROVIDES', exact: false }]);
  assert.equal(await page.locator('#credentialType').isChecked(), true);
  assert.equal(await page.locator('#otherType').isChecked(), false);
  await page.close();
});

test('checkpoint recovery never substitutes a prefix or non-unique secondary identifier', () => {
  const attempts = buildSearchAttempts({
    businessUnit: { entityPrefix: 'RPM', viewExistingEntityFallbackToPrefix: true },
    entityName: 'RPM_unique_checkpoint',
    actionName: 'View',
    strictEntityMatch: true,
    searchFallbacks: [{ fieldNames: ['Local License #'], value: 'LL#123' }],
  });
  assert.equal(attempts.every((attempt) => attempt.type === 'name' && attempt.value === 'RPM_unique_checkpoint'), true);
  assert.equal(isClosedPageError('Target page was closed before waiting for app idle.'), true);
  assert.equal(isClosedPageError('Target page was closed during profile Save.'), true);
  assert.equal(isClosedPageError('Radio option was not found.'), false);
});

test('only specific transport failures qualify for bounded navigation recovery', () => {
  assert.equal(isTransientNavigationError('net::ERR_NETWORK_IO_SUSPENDED'), true);
  assert.equal(isTransientNavigationError(new Error('net::ERR_CONNECTION_RESET')), true);
  for (const message of ['HTTP 500', 'Invalid password', 'Number of Tubes is required', 'net::ERR_ABORTED', 'net::ERR_CERT_AUTHORITY_INVALID']) {
    assert.equal(isTransientNavigationError(message), false);
  }
});

test('a browser error page fails before waiting for missing application controls', async () => {
  await assert.rejects(() => assertPageAccess({
    url: () => 'chrome-error://chromewebdata/',
    locator: () => assert.fail('must not wait for a form on the browser error page'),
  }, 'create form'), /Browser navigation failed during create form/);
});

test('navigation diagnostics capture document failures and clear after a successful recovery', async () => {
  const context = await browser.newContext();
  const failureForPage = trackNavigationFailures(context);
  try {
    await context.route('http://navigation.test/**', (route) => route.request().url().endsWith('/fail')
      ? route.abort('connectionreset')
      : route.fulfill({ contentType: 'text/html', body: '<h1>Recovered</h1>' }));
    const page = await context.newPage();
    await assert.rejects(() => page.goto('http://navigation.test/fail'));
    assert.equal(failureForPage(page)?.error, 'net::ERR_CONNECTION_RESET');
    assert.equal(failureForPage(page)?.method, 'GET');
    await page.waitForURL((url) => url.protocol === 'chrome-error:', { waitUntil: 'commit', timeout: 5000 });
    await page.goto('http://navigation.test/recovered');
    assert.equal(failureForPage(page), undefined);
  } finally {
    await context.close();
  }
});

test('credential popup waits for a delayed ASP.NET callback on its opener', async () => {
  const context = await browser.newContext();
  try {
    await context.route('http://alis.test/**', async (route) => {
      const popup = route.request().url().endsWith('/popup');
      await route.fulfill({
        contentType: 'text/html',
        body: popup ? `
          <label><input type="radio" name="credential">Hospital</label>
          <a href="#" onclick="opener.finishCredential(); window.close(); return false;">OK</a>
        ` : `
          <a href="/popup" target="_blank" rel="opener">Credential Type</a>
          <script>
            window.credentialReady = false;
            window.busy = false;
            window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({
              get_isInAsyncPostBack: () => window.busy
            }) } } };
            window.finishCredential = () => {
              window.busy = true;
              setTimeout(() => {
                window.busy = false;
                window.credentialReady = true;
              }, 6_000);
            };
          </script>
        `,
      });
    });
    const page = await context.newPage();
    await page.goto('http://alis.test/parent');
    await runUiActions(page, [{
      type: 'popupFromLink', name: 'Credential Type', attempts: 1,
      actions: [
        { type: 'radio', name: 'Hospital', exact: true },
        { type: 'clickLink', name: 'OK' },
      ],
    }]);
    assert.equal(await page.evaluate(() => window.credentialReady), true);
    assert.equal(context.pages().length, 1);
  } finally {
    await context.close();
  }
});

test('credential popup restores values cleared by its own delayed postback before OK', { timeout: 25000 }, async () => {
  const context = await browser.newContext();
  try {
    await context.route('http://popup-refresh.test/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: route.request().url().endsWith('/popup') ? `
        <label>Serial No.<input id="serial"></label>
        <label>Number of Tubes<input id="tubes"></label>
        <label>Manufacturer<input id="manufacturer"></label>
        <label><input type="radio" name="used" onchange="refreshForm()">No</label>
        <div id="ValidationSummary" data-valsummary="true"></div>
        <a href="#" onclick="submitForm(); return false;">OK</a>
        <script>
          window.busy = false;
          window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({
            get_isInAsyncPostBack: () => window.busy
          }) } } };
          window.refreshForm = () => {
            window.busy = true;
            setTimeout(() => {
              for (const id of ['serial', 'tubes', 'manufacturer']) document.getElementById(id).value = '';
              opener.refreshes += 1;
              window.busy = false;
            }, 1800);
          };
          window.submitForm = () => {
            const submit = () => {
              const values = ['serial', 'tubes', 'manufacturer'].map(id => document.getElementById(id).value);
              if (values.some(value => !value)) {
                document.getElementById('ValidationSummary').textContent = 'Serial No. is a required field.';
                return;
              }
              opener.savedValues = values;
              window.close();
            };
            if (window.busy) setTimeout(submit, 2000); else submit();
          };
        </script>
      ` : `<a href="/popup" target="_blank" rel="opener">Credential Type</a><script>window.refreshes = 0;</script>`,
    }));
    const page = await context.newPage();
    await page.goto('http://popup-refresh.test/parent');
    await runUiActions(page, [{
      type: 'popupFromLink', name: 'Credential Type', attempts: 1, closeTimeoutMs: 1500,
      actions: [
        { type: 'textbox', name: 'Serial No.', value: 'SER123' },
        { type: 'textbox', name: 'Number of Tubes', value: '3' },
        { type: 'textbox', name: 'Manufacturer', value: 'Test Manufacturer' },
        { type: 'radio', name: 'No', exact: true },
        { type: 'clickLink', name: 'OK' },
      ],
    }]);
    assert.equal(await page.evaluate(() => window.refreshes), 1);
    assert.deepEqual(await page.evaluate(() => window.savedValues), ['SER123', '3', 'Test Manufacturer']);
    assert.equal(context.pages().length, 1);
  } finally {
    await context.close();
  }
});

test('persistent popup validation fails clearly without blindly reopening the form', { timeout: 15000 }, async () => {
  const context = await browser.newContext();
  let openings = 0;
  try {
    await context.route('http://popup-invalid.test/**', (route) => {
      const popup = route.request().url().endsWith('/popup');
      if (popup) openings += 1;
      return route.fulfill({ contentType: 'text/html', body: popup ? `
        <label><input type="radio" name="type">Hospital</label>
        <div data-valsummary="true" id="errors"></div>
        <a href="#" onclick="document.getElementById('errors').textContent='Number of Tubes is a required field.'; return false;">OK</a>
      ` : '<a href="/popup" target="_blank" rel="opener">Credential Type</a>' });
    });
    const page = await context.newPage();
    await page.goto('http://popup-invalid.test/parent');
    await assert.rejects(() => runUiActions(page, [{
      type: 'popupFromLink', name: 'Credential Type', attempts: 5, closeTimeoutMs: 300,
      actions: [{ type: 'radio', name: 'Hospital' }, { type: 'clickLink', name: 'OK' }],
    }]), /was rejected: Number of Tubes is a required field/);
    assert.equal(openings, 1);
  } finally {
    await context.close();
  }
});
