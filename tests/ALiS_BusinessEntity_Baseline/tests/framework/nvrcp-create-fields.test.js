import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { resolveBusinessUnit } from '../../config/BusinessUnit.js';
import { ensureUiActionValues, runUiActions } from '../../utils/uiActions.js';

let browser;
const entityName = 'NVRCP_SCHEMA_TEST';
const businessFieldNames = new Set(['DBA / Business Name', 'Local License #']);

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

function versionedFields(businessUnitId) {
  return resolveBusinessUnit(businessUnitId).createEntityFields
    .filter((action) => businessFieldNames.has(action.name));
}

test('all NVRCP builders supply independent business-name and legacy-license values', () => {
  for (const businessUnitId of ['RPM', 'RM', 'MAMMO']) {
    const fields = versionedFields(businessUnitId);
    const businessName = fields.find((field) => field.name === 'DBA / Business Name');
    const license = fields.find((field) => field.name === 'Local License #');
    assert.equal(fields.length, 2, businessUnitId);
    assert.equal(businessName.value, '$ENTITY_NAME', businessUnitId);
    assert.equal(businessName.optional, true, `${businessUnitId}: absent on old versions`);
    assert.equal(license.optional, true, `${businessUnitId}: removed on current versions`);
    assert.match(license.value, /^LL#\d+$/, businessUnitId);
    assert.notEqual(license.value, businessName.value, businessUnitId);
  }
});

test('legacy NVRCP pages fill Local License without requiring a nonexistent DBA field', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<label for="license">Local License #</label><input id="license">');
    for (const businessUnitId of ['RPM', 'RM', 'MAMMO']) {
      const fields = versionedFields(businessUnitId);
      await runUiActions(page, fields, { entityName });
      await ensureUiActionValues(page, fields, { entityName }, { attempts: 1, settleMs: 0 });
      assert.equal(await page.locator('#license').inputValue(), fields[1].value, businessUnitId);
    }
  } finally {
    await page.close();
  }
});

test('current NVRCP pages fill required DBA while Local License is removed or hidden', async () => {
  const page = await browser.newPage();
  try {
    for (const oldLicenseMarkup of [
      '',
      '<div hidden><label for="license">Local License #</label><input id="license" value="unused"></div>',
    ]) {
      await page.setContent(`
        <label for="business">DBA / Business Name<span>*</span></label>
        <input id="business" required>
        ${oldLicenseMarkup}
      `);
      for (const businessUnitId of ['RPM', 'RM', 'MAMMO']) {
        const fields = versionedFields(businessUnitId);
        await runUiActions(page, fields, { entityName });
        await ensureUiActionValues(page, fields, { entityName }, { attempts: 1, settleMs: 0 });
        assert.equal(await page.locator('#business').inputValue(), entityName, businessUnitId);
      }
      if (oldLicenseMarkup) assert.equal(await page.locator('#license').inputValue(), 'unused');
    }
  } finally {
    await page.close();
  }
});

test('pre-save verification restores visible version-dependent fields cleared by a callback', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`
      <label for="business">DBA / Business Name</label><input id="business">
      <label for="license">Local License #</label><input id="license">
    `);
    const fields = versionedFields('RPM');
    await runUiActions(page, fields, { entityName });
    await page.evaluate(() => {
      document.getElementById('business').value = '';
      document.getElementById('license').value = '';
    });
    await ensureUiActionValues(page, fields, { entityName }, { attempts: 1, settleMs: 0 });
    assert.equal(await page.locator('#business').inputValue(), entityName);
    assert.equal(await page.locator('#license').inputValue(), fields[1].value);
  } finally {
    await page.close();
  }
});

test('hidden optional selector controls are skipped during fill and pre-save verification', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<input id="retainedLegacyControl" style="display:none" value="unchanged">');
    const actions = [{
      type: 'locatorFill', selector: '#retainedLegacyControl', value: 'new', optional: true,
    }];
    await runUiActions(page, actions);
    await ensureUiActionValues(page, actions, {}, { attempts: 1, settleMs: 0 });
    assert.equal(await page.locator('#retainedLegacyControl').inputValue(), 'unchanged');
  } finally {
    await page.close();
  }
});

test('missing required fields still fail filling and pre-save verification', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(250);
  try {
    await page.setContent('<main>New Business Entity</main>');
    const fields = [{ type: 'textbox', name: 'NV Business ID', value: 'NV12345678901' }];
    await assert.rejects(() => runUiActions(page, fields), /Timeout.*exceeded/s);
    await assert.rejects(
      () => ensureUiActionValues(page, fields, {}, { attempts: 1, settleMs: 0 }),
      /Required create form values did not remain stable before Save: NV Business ID/,
    );
  } finally {
    await page.close();
  }
});

test('a visible disabled version-dependent field fails instead of being silently skipped', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(250);
  try {
    await page.setContent('<label for="business">DBA / Business Name</label><input id="business" disabled>');
    const fields = versionedFields('RPM').filter((field) => field.name === 'DBA / Business Name');
    await assert.rejects(() => runUiActions(page, fields, { entityName }), /Timeout.*exceeded/s);
    await assert.rejects(
      () => ensureUiActionValues(page, fields, { entityName }, { attempts: 1, settleMs: 0 }),
      /Timeout.*exceeded/s,
    );
    assert.equal(await page.locator('#business').inputValue(), '');
  } finally {
    await page.close();
  }
});
