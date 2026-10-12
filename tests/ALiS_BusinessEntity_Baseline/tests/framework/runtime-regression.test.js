import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { saveCreatedEntity } from '../../flows/CreateEntityFlow.js';
import { runUiActions } from '../../utils/uiActions.js';

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

  await saveCreatedEntity(page, { createSaveAttempts: 1 });
  assert.match(await page.locator('body').innerText(), /saved successfully/i);
  await page.close();
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
