import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { buildApplicationTargets, selectInstallationTargets, VARIANCE_INSTALLATION_APP_TYPES } from '../../config/applicationTypes.js';
import { COMMERCIAL_ENDORSEMENT_TYPES, RESIDENTIAL_ENDORSEMENT_TYPES } from '../../config/constants.js';
import { PermitApplicationPage } from '../../pages/PermitApplicationPage.js';
import { ConveyanceVariancePage } from '../../pages/ConveyanceVariancePage.js';
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

test('CV is a single permit-free target and can be mixed with an installation selection', () => {
  const [target] = buildApplicationTargets({ AppType: 'cv', ResType: 'ALL', CommType: 'ALL' });
  assert.equal(target.appType, 'CV');
  assert.equal(target.permit, null);
  assert.equal(target.endorsement, null);
  assert.throws(() => buildApplicationTargets({ AppType: 'cv', PerType: 'Res' }), /does not use PerType/);
  assert.deepEqual(buildApplicationTargets({ AppType: 'cv,nci', PerType: 'Comm', CommType: 'FC' })
    .map(({ appType, perType }) => [appType, perType]), [['CV', ''], ['NCI', 'Comm']]);
});

test('installation selections use overrides, compatible settings, then random choices', () => {
  const last = { pickIndex: length => length - 1 };
  const configured = { AppType: 'NCI', PerType: 'Res', ResType: 'ORC' };
  const labels = (overrides, settings, options = last) => selectInstallationTargets(overrides, settings, options).map(target => target.label);
  assert.deepEqual(labels({}, configured), ['NCI / Res / ORC']);
  assert.deepEqual(labels({ AppType: 'NCI' }, configured), ['NCI / Res / ORC']);
  assert.deepEqual(labels({ PerType: 'Comm', CommType: 'FC' }, configured), ['NCI / Comm / FC']);
  assert.deepEqual(labels({ AppType: 'CHI' }, configured), ['CHI / CMH(A10.5)']);
  assert.deepEqual(labels({ AppType: '', PerType: '' }, { ...configured, ResType: '' }), ['CHI / CMH(A10.5)']);
  assert.deepEqual(labels({ AppType: 'NCI', ResType: '' }, configured), ['NCI / Res / RANDOM']);
  assert.deepEqual(labels({ CommType: 'FC' }, {}), ['NCI / Comm / FC']);
  assert.deepEqual(labels({ AppType: 'ALL', PerType: 'ALL' }, {}).length, 4);
  assert.throws(() => labels({ AppType: 'CHI', PerType: 'Res' }, configured), /Unsupported installation PerType/);
  const variance = { ...last, appTypes: VARIANCE_INSTALLATION_APP_TYPES };
  assert.deepEqual(labels({}, {}, variance), ['CHI / CMH(A10.5)']);
  assert.deepEqual(labels({ AppType: 'CHI', PerType: 'ALL' }, {}, variance), ['CHI / CPH(A10.4)', 'CHI / CMH(A10.5)']);
  assert.deepEqual(labels({ AppType: 'ALL', PerType: 'Comm', CommType: 'FC' }, {}, variance), ['NCI / Comm / FC']);
  assert.throws(() => labels({ AppType: 'NCI,CHI', PerType: 'Comm' }, {}, variance), /No PerType selected for AppType CHI/);
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

test('direct variance selects the provided conveyance number without starting an installation', { timeout: 15_000 }, async (t) => {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  await page.setContent(`
    <label><input type="radio" name="app" value="NCI"> New Conveyance Installation</label>
    <label><input type="radio" name="app" value="CV"> Conveyance Variance</label>
    <label>Conveyance # <input id="number"></label>
    <label id="permit" hidden><input type="radio" name="permit"> License Type</label>
    <button>Next</button>
    <output></output>
    <script>
      const number = document.querySelector('#number');
      number.onblur = () => {
        if (number.value === '009790' && document.querySelector('[value="CV"]').checked) {
          document.querySelector('#permit').hidden = false;
        }
      };
      document.querySelector('button').onclick = () => {
        if (document.querySelector('[name="permit"]').checked) document.querySelector('output').textContent = number.value;
      };
    </script>`);
  await new ConveyanceVariancePage(page).selectExistingConveyance('009790');
  assert.equal(await page.locator('output').innerText(), '009790');
  assert.equal(await page.getByRole('radio', { name: 'New Conveyance Installation' }).isChecked(), false);
});

test('selects both hoist permits and NCI endorsements through the same page object', { timeout: 30_000 }, async (t) => {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  const targets = buildApplicationTargets({ AppType: 'NCI,CHI', ResType: 'ORC', CommType: 'FC' });
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
