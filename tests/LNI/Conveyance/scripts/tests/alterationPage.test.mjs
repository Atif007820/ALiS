import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { ConveyanceAlterationPage } from '../../pages/ConveyanceAlterationPage.js';
import { buildApplicationTargets } from '../../config/applicationTypes.js';
import { buildFlowStages, SERIAL_FLOW_SPECS } from '../flowPlan.mjs';

let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => browser?.close());

const information = `
  <input id="outside" value="Other section">
  <mat-expansion-panel>
    <mat-expansion-panel-header>Conveyance Information<span>Conveyance #202878</span></mat-expansion-panel-header>
    <label>Conveyance # <input id="identity" value="202878"></label>
    <label>Rated Speed <input id="speed" type="number" min="20" max="25" value="21" required></label>
    <label>Designation <input id="designation" maxlength="3" value="AB1"></label>
    <label>Readonly <input id="readonly-input" value="OLD" readonly></label>
    <label>Door Type <select id="door"><option value="a">A</option><option value="b" disabled>B</option><option value="c">C</option></select></label>
    <label>Emergency Power <input id="power" type="checkbox" checked></label>
    <label>Required Consent <input id="consent" type="checkbox" checked required></label>
    <label>Hydraulic <input id="hydraulic" name="drive" type="radio" checked></label>
    <label>Electric <input id="electric" name="drive" type="radio"></label>
    <button id="material" role="combobox" aria-label="Material" aria-controls="materials" aria-expanded="false">Steel</button>
  </mat-expansion-panel>
  <div role="listbox" id="materials" hidden>
    <button role="option" aria-selected="true">Steel</button><button role="option" aria-selected="false" aria-disabled="true">Unavailable</button>
    <button id="material-option" role="option" aria-selected="false">Aluminum</button>
  </div>
  <script>
    document.querySelector('#material').onclick = () => document.querySelector('#materials').hidden = false;
    document.querySelector('#material-option').onclick = () => {
      document.querySelector('#material').textContent = 'Aluminum';
      document.querySelector('#materials').hidden = true;
    };
  </script>`;

async function mock(t, html) {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  t.after(() => page.close());
  await page.route('**/*', route => route.abort());
  await page.setContent(html);
  return { page, workflow: new ConveyanceAlterationPage(page) };
}

test('Alteration accepts the recorded conveyance number and selects its own radio', async t => {
  const { page, workflow } = await mock(t, `
    <label><input type="radio" name="app"> Conveyance Variance</label>
    <label><input type="radio" name="app"> Conveyance Alteration</label>
    <label>Conveyance # <input></label><label><input type="radio" name="permit"> License Type</label>
    <button>Next</button>`);
  await workflow.selectExistingConveyance('202878', 'CA');
  assert.equal(await page.getByRole('radio', { name: 'Conveyance Alteration' }).isChecked(), true);
  assert.equal(await page.getByRole('radio', { name: 'Conveyance Variance' }).isChecked(), false);
  assert.equal(await page.getByRole('textbox', { name: 'Conveyance #' }).inputValue(), '202878');
});

test('Alteration can change nothing or a full eligible subset without touching identity or other sections', async t => {
  const { page, workflow } = await mock(t, information);
  assert.deepEqual(await workflow.randomizeConveyanceInformation(() => 0), []);
  assert.equal(await page.locator('#speed').inputValue(), '21');
  const changed = await workflow.randomizeConveyanceInformation(size => size - 1);
  assert.deepEqual(changed.sort(), ['Designation', 'Door Type', 'Electric', 'Emergency Power', 'Material', 'Rated Speed']);
  assert.equal(await page.locator('#identity').inputValue(), '202878');
  assert.equal(await page.locator('#outside').inputValue(), 'Other section');
  assert.equal(await page.locator('#readonly-input').inputValue(), 'OLD');
  assert.equal(await page.locator('#consent').isChecked(), true);
  assert.equal(await page.locator('#speed').inputValue(), '25');
  assert.equal(await page.locator('#door').inputValue(), 'c');
  assert.equal(await page.locator('#electric').isChecked(), true);
  assert.equal(await page.locator('#power').isChecked(), false);
  assert.equal(await page.locator('#material').textContent(), 'Aluminum');
});

test('Alteration fills the dependent description only when the native operation dropdown selects Other', async t => {
  const { page, workflow } = await mock(t, `
    <section>
      <h2>Conveyance Information</h2>
      <label for="operation">How is it operated?</label>
      <select id="operation"><option value="APB">Automatic</option><option value="OTHR">Other</option></select>
      <label id="description" hidden>Operated Other Description <input required></label>
    </section>
    <script>
      document.querySelector('#operation').onchange = ({ target }) => setTimeout(() => {
        document.querySelector('#description').hidden = target.value !== 'OTHR';
      }, 50);
    </script>`);
  const operation = page.getByLabel('How is it operated?', { exact: true });
  const description = page.getByRole('textbox', { name: 'Operated Other Description', exact: true });
  const chooseAll = size => size - 1;
  assert.deepEqual(await workflow.randomizeConveyanceInformation(chooseAll), ['How is it operated?']);
  assert.equal(await operation.inputValue(), 'OTHR');
  assert.equal(await description.inputValue(), 'Testing');

  // The visible dependent field is not independently randomized on the next pass.
  assert.deepEqual(await workflow.randomizeConveyanceInformation(chooseAll), ['How is it operated?']);
  assert.equal(await operation.inputValue(), 'APB');
  await description.waitFor({ state: 'hidden' });
});

test('Alteration handles Other in a custom operation dropdown with an associated label', async t => {
  const { page, workflow } = await mock(t, `
    <section>
      <h2>Conveyance Information</h2>
      <span id="operation-label">How is it operated?</span>
      <button id="operation" role="combobox" aria-labelledby="operation-label" aria-controls="options">Automatic</button>
      <div id="description"></div>
    </section>
    <div id="options" role="listbox" hidden>
      <button role="option" aria-selected="true">Automatic</button>
      <button id="other" role="option" aria-selected="false">Other</button>
    </div>
    <script>
      document.querySelector('#operation').onclick = () => document.querySelector('#options').hidden = false;
      document.querySelector('#other').onclick = () => {
        document.querySelector('#options').hidden = true;
        document.querySelector('#operation').textContent = 'Other';
        setTimeout(() => {
          document.querySelector('#description').innerHTML = '<label>Operated Other Description <input required></label>';
        }, 50);
      };
    </script>`);
  assert.deepEqual(await workflow.randomizeConveyanceInformation(size => size - 1), ['How is it operated?']);
  assert.equal(await page.getByRole('textbox', { name: 'Operated Other Description', exact: true }).inputValue(), 'Testing');
});

test('Alteration override skips information changes but still fills the contract and recorded details', async t => {
  const { page, workflow } = await mock(t, `
    <h1>Entity Information</h1>
    <select id="ddlCopy_LMA"><option></option><option value="MLG">Mailing</option></select>
    <input id="ContactName_LMA"><select id="ddlCopy_CON"><option></option><option value="SLAAPP">Applicant</option></select>
    <input id="txtRestriction"><label>Conveyance Contract Value <input></label>`);
  workflow.selectExistingConveyance = async (number, type) => assert.deepEqual([number, type], ['00100', 'CA']);
  workflow.uploadSupportingDocument = async comments => assert.equal(comments, '');
  for (const step of ['next', 'answerReviewQuestions', 'attestSubmitAndPayLater', 'expectConfirmation']) workflow[step] = async () => {};
  workflow.randomizeConveyanceInformation = async () => assert.fail('Information changes must be skipped');
  const result = await workflow.completeAlterationApplication('00100', { preserveInformation: true });
  assert.equal(result.informationChanges, 0);
  assert(Number(result.contractValue) >= 1000 && Number(result.contractValue) <= 10000);
  assert.equal(await page.getByRole('textbox', { name: 'Conveyance Contract Value' }).inputValue(), result.contractValue);
  assert.equal(await page.locator('#ddlCopy_CON').inputValue(), 'SLAAPP');
  assert.equal(await page.locator('#txtRestriction').inputValue(), 'Test');
});

test('every configured installation and endorsement can feed the two Alteration stages', () => {
  const installations = buildApplicationTargets({ AppType: 'NCI,CHI', PerType: 'ALL', ResType: 'ALL', CommType: 'ALL' });
  const [target] = buildApplicationTargets({ AppType: 'CA' });
  assert.equal(installations.length, 34);
  for (const installation of installations) {
    const plans = buildFlowStages({ ...target, installation }, SERIAL_FLOW_SPECS);
    assert.deepEqual(plans.map(stage => stage.phase), ['installation', 'installation', 'installation', 'alteration', 'alteration']);
    assert.deepEqual(plans.map(stage => stage.selection.appType), [installation.appType, installation.appType, installation.appType, 'CA', 'CA']);
  }
});
