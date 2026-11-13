import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { buildApplicationTargets } from '../../config/applicationTypes.js';
import { COMMERCIAL_ENDORSEMENT_TYPES, RESIDENTIAL_ENDORSEMENT_TYPES } from '../../config/constants.js';
import { PermitApplicationPage } from '../../pages/PermitApplicationPage.js';
import { addApplyAnnotations } from '../../utils/annotations.js';

test('expands only compatible pairs and scopes endorsement overrides to their own permit', () => {
  const targets = buildApplicationTargets({ AppType: 'nci,chi', PerType: 'ALL', ResType: 'RC', CommType: 'FC' });
  assert.deepEqual(targets.map(({ appType, perType, endorsement }) => [appType, perType, endorsement?.code]), [
    ['NCI', 'Res', 'ORC'], ['NCI', 'Comm', 'FC'], ['CHI', 'CPH(A10.4)', undefined], ['CHI', 'CMH(A10.5)', undefined],
  ]);
  assert.equal(new Set(targets.map(target => target.slug)).size, 4);
  assert.deepEqual(buildApplicationTargets({
    AppType: 'chi,nci', PerType: 'cmh(a10.5),comm,COMM', ResType: 'ignored',
  }).map(target => target.perType), ['CMH(A10.5)', 'Comm']);
  assert.equal(buildApplicationTargets({ AppType: 'NCI', PerType: 'Res', ResType: ' ' })[0].endorsement, null);
  assert.doesNotThrow(() => buildApplicationTargets({ AppType: 'CHI', ResType: 'ignored', CommType: 'ignored' }));
});

test('rejects unknown applications, incompatible permits, and invalid applicable endorsements', () => {
  assert.throws(() => buildApplicationTargets({ AppType: 'typo' }), /Unsupported AppType/);
  assert.throws(() => buildApplicationTargets({ AppType: 'CHI', PerType: 'Comm' }), /Unsupported PerType for CHI/);
  assert.throws(() => buildApplicationTargets({ AppType: 'NCI,CHI', PerType: 'Res' }), /No PerType selected for AppType CHI/);
  assert.throws(() => buildApplicationTargets({ AppType: 'NCI', PerType: 'Comm', CommType: 'ORC' }), /Unsupported CommType/);
});

test('expands ALL and comma lists to distinct endorsement runs for the selected permit', () => {
  const commercial = buildApplicationTargets({ AppType: 'NCI', PerType: 'Comm', CommType: 'ALL', ResType: 'ALL' });
  assert.deepEqual(commercial.map(({ endorsement }) => endorsement.code), Object.keys(COMMERCIAL_ENDORSEMENT_TYPES));
  assert.equal(new Set(commercial.map(target => target.slug)).size, commercial.length);
  const residential = buildApplicationTargets({ AppType: 'NCI', PerType: 'Res', ResType: 'ALL' });
  assert.deepEqual(residential.map(({ endorsement }) => endorsement.code), Object.keys(RESIDENTIAL_ENDORSEMENT_TYPES));
  assert.deepEqual(buildApplicationTargets({ AppType: 'NCI', PerType: 'Res', ResType: 'RC, orc, RE' })
    .map(({ endorsement }) => endorsement.code), ['ORC', 'RE']);
  assert.throws(() => buildApplicationTargets({ AppType: 'NCI', PerType: 'Comm', CommType: 'FC,ALL' }), /Unsupported CommType/);
});

test('report annotations use full application and permit names', () => {
  const saved = { ...process.env };
  try {
    process.env.CONVEYANCE_APP_TYPE = 'CHI';
    process.env.CONVEYANCE_PER_TYPE = 'CMH(A10.5)';
    const testInfo = { annotations: [] };
    addApplyAnnotations(testInfo, { transactionNumber: '6403' });
    const values = Object.fromEntries(testInfo.annotations.map(({ type, description }) => [type, description]));
    assert.equal(values['Application Type'], 'Construction Hoist Installation');
    assert.equal(values['Permit Type'], 'Construction Material Hoist (A10.5) - New Installation');
    assert.equal(values.AppType, undefined);
    assert.equal(values.PerType, undefined);
  } finally {
    for (const key of ['CONVEYANCE_APP_TYPE', 'CONVEYANCE_PER_TYPE']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => browser?.close());

test('selects both hoist permits and NCI endorsements through the same page object', { timeout: 30_000 }, async (t) => {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  const targets = buildApplicationTargets({ AppType: 'ALL', ResType: 'ORC', CommType: 'FC' });
  for (const [index, target] of targets.entries()) {
    await page.setContent(`
      <label><input type="radio" name="app" value="NCI"> New Conveyance Installation</label>
      <label><input type="radio" name="app" value="CHI"> Construction Hoist</label>
      <div id="permits" hidden>
        <label><input type="radio" name="permit" value="0"> <span></span></label>
        <label><input type="radio" name="permit" value="1"> <span></span></label>
      </div>
      <div id="endorsements" hidden>
        <label><input type="radio" name="endorsement"> OTHER RESIDENTIAL CONVEYANCE</label>
        <label><input type="radio" name="endorsement"> FREIGHT CABLE</label>
      </div>
      <button>Next</button>`);
    const labels = Object.values(target.application.permits).map(permit => permit.label);
    await page.evaluate(({ labels, useGeneric }) => {
      const permits = document.querySelector('#permits');
      for (const [index, label] of [...permits.querySelectorAll('label')].entries()) {
        label.querySelector('span').textContent = labels[index];
        if (useGeneric) label.querySelector('input').setAttribute('aria-label', 'License Type');
      }
      document.querySelectorAll('input[name="app"]').forEach(radio => {
        radio.onchange = () => { permits.hidden = false; };
      });
      permits.onchange = () => {
        document.querySelector('#endorsements').hidden = !document.querySelector('input[value="NCI"]').checked;
      };
    }, { labels, useGeneric: index % 2 === 0 });
    const selected = await new PermitApplicationPage(page).selectApplicationAndPermit(target);
    assert.equal(selected.perType, target.perType);
    assert.equal(selected.endorsementCode, target.endorsement?.code);
    assert.equal(await page.locator('input[name="permit"]:checked').inputValue(), String(target.permit.radioIndex));
  }
});
