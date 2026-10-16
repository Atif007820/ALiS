import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { saveCreatedEntity } from '../../flows/CreateEntityFlow.js';
import { runUiActions } from '../../utils/uiActions.js';
import { buildEntityName } from '../../utils/randomData.js';
import { buildSearchAttempts } from '../../flows/ModifySearchFlow.js';
import { isClosedPageError } from '../../utils/pageGuards.js';

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

test('parallel creates have different names even when their prefix and clock are identical', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  const names = Array.from({ length: 1_000 }, () => buildEntityName('HF', now));
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.every((name) => /^HF_.*_[a-f0-9]{12}$/.test(name)), true);
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
