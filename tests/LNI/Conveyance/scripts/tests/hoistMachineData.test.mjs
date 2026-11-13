import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { MachineInformationPage } from '../../pages/MachineInformationPage.js';

function machineForm() {
  const text = (name, id = '') => `<label>${name}<input type="text" ${id ? `id="${id}"` : ''}></label>`;
  const select = (label, id, options) => `<label>${label}<select id="${id}">
    <option value="">-- Choose One --</option>
    ${options.map(option => `<option>${option}</option>`).join('')}
    <option disabled>DISABLED</option>
  </select></label>`;
  return `<cc-machine-information>
    ${['Winding Drum', 'Geared'].map(name => `<label><input type="checkbox">${name}</label>`).join('')}
    <div formcontrolname="IsDetectionDeviceProvided">
      <label><input type="radio" name="overload" value="Yes">Yes</label>
      <label><input type="radio" name="overload" value="No">No</label>
    </div>
    ${[
      'Conveyance/Escalator Manufacturer', 'Conveyance/Escalator Model', 'Conveyance Designation',
      'Capacity (lbs)', 'Rated Speed (feet per minute)', '# of Landings', 'Type of car governor',
      'Size of Platform', '# of Car entrances/gates', 'Type of signals', 'Type of entrance',
      '# of Hoistway entrances', 'Net Travel (inches)', 'Height of doors or gates',
      'Type of Drive (geared, etc.)', 'Type of Brake', 'Motor Horsepower',
    ].map(name => text(name)).join('')}
    ${text('Rise in Feet', 'txtRiseInFeet')}
    ${text('Rise in Inch', 'txtRiseInInch')}
    ${select('How is it operated?', 'operation', ['CARS', 'OTHR'])}
    <div id="other" hidden>${text('Operated Other Description')}</div>
    ${select('Machine/Brake Location', 'brake', ['A', 'B'])}
    ${['Cable', 'GovernorCable'].map(prefix => [
      ...['Type', 'Number', 'Size'].map(suffix => text(suffix, 'txt' + prefix + suffix)),
      select('Size Unit', 'ddl' + prefix + 'SizeUnitCode', ['INCH', 'MMET']),
    ].join('')).join('')}
    <script>
      document.getElementById('operation').onchange = event => {
        document.getElementById('other').hidden = event.target.value !== 'OTHR';
      };
    </script>
  </cc-machine-information>`;
}

test('fills both hoist data extremes and handles Other and both cable units', { timeout: 45_000 }, async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.route('**/*', route => route.abort());
  const originalRandom = Math.random;
  try {
    for (const sample of [0.01, 0.99]) {
      Math.random = () => sample;
      await page.setContent(machineForm());
      await new MachineInformationPage(page).fillConstructionHoist();

      const other = sample > 0.5;
      assert.equal(await page.locator('#operation').inputValue(), other ? 'OTHR' : 'CARS');
      assert.equal(await page.locator('#brake').inputValue(), other ? 'B' : 'A');
      assert.equal(await page.locator('input[name="overload"]:checked').inputValue(), other ? 'No' : 'Yes');
      assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
      if (other) assert.match(await page.getByRole('textbox', { name: 'Operated Other Description' }).inputValue(), /\S/);
      for (const prefix of ['Cable', 'GovernorCable']) {
        assert.equal(await page.locator('#ddl' + prefix + 'SizeUnitCode').inputValue(), other ? 'MMET' : 'INCH');
        const size = Number(await page.locator('#txt' + prefix + 'Size').inputValue());
        assert.ok(other ? size >= 6 && size <= 19 : size >= 0.25 && size <= 0.75);
      }
      assert.deepEqual(await page.locator('cc-machine-information input[type=text]:visible')
        .evaluateAll(inputs => inputs.filter(input => !input.value).map(input => input.id)), []);
    }
  } finally {
    Math.random = originalRandom;
  }
});
