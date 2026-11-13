import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { appConfig } from '../../config/runConfig.js';
import { ApproveApplicationPage } from '../../pages/ApproveApplicationPage.js';

const application = { transactionNumber: '009341', entityName: 'CONV_APPROVAL_FIXTURE' };
const credentials = { loginName: 'fixture-admin', password: 'FixtureOnly@123' };
let browser;

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  appConfig.timeouts.expect = 1_500;
  appConfig.timeouts.action = 1_500;
});

after(async () => browser?.close());

function filterMarkup(id, label, initialValue, option) {
  return `<div class="form-group">
    <label for="${id}">${label}</label>
    <input id="${id}" value="${initialValue}" readonly aria-haspopup="listbox">
    <div role="listbox" aria-label="${label}" hidden>
      <button type="button" role="option">${option}</button>
    </div>
  </div>`;
}

function queueFixture(resultMode) {
  return `<!doctype html><meta charset="utf-8"><title>Conveyance Work Queue fixture</title>
    <main id="loginForm">
      <label>Login Name <input id="loginName"></label>
      <label>Password <input id="password" type="password" role="textbox"></label>
      <a id="login" href="#">Login</a>
    </main>
    <nav id="navigation" hidden>
      <div>NPApply for New Permit</div>
      <a id="licensing" href="#">Licensing</a>
      <a id="openQueue" href="#" hidden>Work Queue</a>
    </nav>
    <main id="queue" hidden>
      <h1>Work Queue</h1>
      <div class="form-group">
        <div>Business Unit *</div>
        <div id="businessUnit" role="combobox" aria-label="Transport Networking Company" aria-haspopup="listbox">
          <input name="businessUnit" value="Transport Networking Company" readonly aria-label="Transport Networking Company">
        </div>
        <div role="listbox" hidden><button type="button" role="option">Conveyance</button></div>
      </div>
      ${filterMarkup('assignedTo', 'Assigned To', 'ADMIN ADMIN', 'All')}
      <label>Transaction # <input id="transaction"></label>
      <button id="search" type="button">Search</button>
      <a id="pull" href="#">Pull |</a>
      <table><thead><tr><th>Select</th><th>Application ID</th><th>TXN # Filter</th><th>Entity Name</th></tr></thead><tbody id="results"></tbody></table>
    </main>
    <div id="pullDialog" role="dialog" aria-label="Confirm Pull" hidden><button id="confirmPull">OK</button></div>
    <div id="statusDialog" role="dialog" aria-label="modal" hidden>
      <div id="validation" hidden>
        <p>Please review following errors and correct them.</p>
        <ul><li>Make sure that all required checklist items are either completed or waived off.</li></ul>
      </div>
      <table><tbody id="checklist"></tbody></table>
      <label for="applicationStatus">Application Status</label>
      <select id="applicationStatus"><option value=""></option><option value="ACP">Accepted</option><option value="APR">Approved</option></select>
      <button id="saveStatus">Save</button>
    </div>
    <script>
      const app = ${JSON.stringify(application)};
      const resultMode = ${JSON.stringify(resultMode)};
      const byId = (id) => document.getElementById(id);
      const state = window.approvalState = { loggedIn: false, searches: [], pulls: [], opened: [], saved: [], closedDialogs: 0 };
      byId('login').onclick = (event) => {
        event.preventDefault();
        if (byId('loginName').value !== ${JSON.stringify(credentials.loginName)} || byId('password').value !== ${JSON.stringify(credentials.password)}) return;
        state.loggedIn = true;
        byId('loginForm').hidden = true;
        byId('navigation').hidden = false;
      };
      byId('licensing').onmouseenter = () => { byId('openQueue').hidden = false; };
      byId('openQueue').onclick = (event) => { event.preventDefault(); byId('queue').hidden = false; };
      for (const id of ['businessUnit', 'assignedTo']) {
        const field = byId(id);
        const valueControl = field.querySelector('input') || field;
        const list = field.nextElementSibling;
        field.onclick = () => { list.hidden = false; };
        list.firstElementChild.onclick = () => { valueControl.value = list.firstElementChild.textContent; list.hidden = true; };
      }
      byId('search').onclick = () => {
        const filters = [
          byId('businessUnit').querySelector('input').value,
          byId('assignedTo').value,
          byId('transaction').value,
        ];
        state.searches.push(filters);
        if (filters.join('|') !== ['Conveyance', 'All', app.transactionNumber].join('|')) return;
        // The same entity can have multiple transactions; its name alone is not safe.
        // The unrelated application repeats the exact requested number in its
        // Application ID column. Only the Transaction # column identifies a match.
        const rows = [['unrelated', app.transactionNumber, app.transactionNumber + '0', app.entityName]];
        if (resultMode !== 'prefix-only') rows.push(['target', 'APP-2026-0001', app.transactionNumber, app.entityName]);
        if (resultMode === 'duplicate') rows.push(['duplicate', 'APP-2026-0002', app.transactionNumber, app.entityName]);
        byId('results').replaceChildren(...rows.map(([key, applicationId, number, name]) => {
          const row = document.createElement('tr');
          row.dataset.key = key;
          row.innerHTML = '<td><input type="checkbox" aria-label="checkbox"></td><td></td><td></td><td><a href="#"></a></td>';
          row.cells[1].textContent = applicationId;
          row.cells[2].textContent = number;
          row.querySelector('a').textContent = name;
          row.querySelector('a').onclick = (event) => {
            event.preventDefault();
            state.opened.push(key);
            if (key === 'target' && state.pulls.at(-1)?.join() === 'target') openStatus();
          };
          return row;
        }));
      };
      byId('pull').onclick = (event) => { event.preventDefault(); byId('pullDialog').hidden = false; };
      byId('confirmPull').onclick = () => {
        const checked = [...byId('results').querySelectorAll('input:checked')];
        state.pulls.push(checked.map((box) => box.closest('tr').dataset.key));
        checked.forEach((box) => { box.checked = false; });
        byId('pullDialog').hidden = true;
      };
      function openStatus() {
        // Renumber and shuffle checklist items to exercise wording rather than row positions.
        let items = state.saved.length === 0
          ? [['review-b', '14 All (State Only) Review Application Fee'], ['mandatory', '8 All Mandatory Required'],
            ['additional', '13 All Additional Supporting'], ['ensure', '9 All (State Only) Ensure payment linked to permit #'],
            ['review-a', '11 All (State Only) Review copy of contract and verify permit purchase price is correct']]
          : [['additional', '10 All Additional Supporting'], ['mandatory', '21 All Mandatory Required']];
        if (resultMode === 'hoist') {
          items = state.saved.length === 0
            ? [['payment', '3 All (State Only) Ensure payment linked to permit #'],
              ['additional', '1 All Additional Supporting Document(s)'],
              ['fee', '2 All (State Only) Review Application Fee']]
            : [['additional', '1 All Additional Supporting Document(s)']];
        }
        if (state.saved.length && resultMode === 'commercial') {
          items.unshift(['blind-hoistway', '19 (State Only) Verify Blind Hoistway value is correct on Conveyance Information tab']);
        }
        if (state.saved.length && resultMode === 'unknown-checklist') {
          items.push(['unrecognized', '24 (State Only) Verify additional engineering review']);
        }
        if (resultMode === 'building-official') {
          items.unshift(['building-official', '31 Commercial Approval by Building Official (Required for existing buildings)']);
        }
        if (resultMode === 'variant-fee') {
          if (!state.saved.length) items = items.filter(([key]) => !['review-b', 'ensure'].includes(key));
          else items.unshift(['fee', '7 All (State Only) Review Application Fee']);
        }
        if (resultMode === 'license-validation') {
          items.unshift(['license-validation', '32 All (State Only) Validate Elevator Contractor License']);
        }
        byId('checklist').innerHTML = items.map(([key, wording]) => '<tr><td>' + wording + '</td><td>' +
          '<select data-key="' + key + '" aria-label="item-status"><option value=""></option>' +
          '<option value="CPT">Complete</option><option value="WOF">Waived</option><option value="PEN" selected>Pending</option></select></td></tr>').join('');
        byId('applicationStatus').value = '';
        byId('statusDialog').hidden = false;
      }
      byId('saveStatus').onclick = () => {
        state.saved.push({ status: byId('applicationStatus').value,
          items: Object.fromEntries([...byId('checklist').querySelectorAll('select')].map((select) => [select.dataset.key, select.value])) });
        if (resultMode === 'reject-approval' && byId('applicationStatus').value === 'APR') {
          byId('validation').hidden = false;
          return;
        }
        setTimeout(() => { byId('statusDialog').hidden = true; state.closedDialogs++; }, 300);
      };
    </script>`;
}

async function setup(t, resultMode = 'default') {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  // Fulfill the configured login URL locally. No other request can reach the portal.
  await context.route('**/*', (route) => {
    if (route.request().isNavigationRequest() && new URL(route.request().url()).pathname.endsWith('/LoginCMS.aspx')) {
      return route.fulfill({ contentType: 'text/html', body: queueFixture(resultMode) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(2_000);
  const workflow = new ApproveApplicationPage(page);
  await workflow.openWorkQueue(credentials);
  return { page, workflow };
}

test('accepts then approves only the exact transaction with the correct checklist statuses', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t);

  const entityName = await workflow.acceptApplication({ transactionNumber: application.transactionNumber });
  assert.equal(entityName, application.entityName);
  assert.equal(await page.evaluate(() => window.approvalState.closedDialogs), 1);
  assert.equal(await workflow.approveApplication({ ...application, entityName }), entityName);

  const state = await page.evaluate(() => window.approvalState);
  assert.equal(state.loggedIn, true);
  assert.ok(state.searches.length >= 1);
  for (const filters of state.searches) assert.deepEqual(filters, ['Conveyance', 'All', application.transactionNumber]);
  assert.deepEqual(state.pulls, [['target'], ['target']]);
  assert.deepEqual(state.opened, ['target', 'target']);
  assert.deepEqual(state.saved, [
    { status: 'ACP', items: { mandatory: 'CPT', 'review-a': 'CPT', 'review-b': 'CPT', additional: 'WOF', ensure: 'CPT' } },
    { status: 'APR', items: { mandatory: 'CPT', additional: 'WOF' } },
  ]);
  assert.equal(state.closedDialogs, 2);
});

test('marks the Commercial Blind Hoistway checklist item Complete before approval', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'commercial');
  await workflow.acceptApplication(application);
  await workflow.approveApplication(application);
  const state = await page.evaluate(() => window.approvalState);
  assert.deepEqual(state.saved.at(-1), {
    status: 'APR', items: { 'blind-hoistway': 'CPT', mandatory: 'CPT', additional: 'WOF' },
  });
  assert.equal(state.closedDialogs, 2);
});

test('accepts and approves a hoist transaction without requiring an NCI plan row', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'hoist');
  const target = { ...application, appType: 'CHI', perType: 'CMH(A10.5)' };
  await workflow.acceptApplication(target);
  await workflow.approveApplication(target);
  assert.deepEqual(await page.evaluate(() => window.approvalState.saved), [
    { status: 'ACP', items: { payment: 'CPT', additional: 'WOF', fee: 'CPT' } },
    { status: 'APR', items: { additional: 'WOF' } },
  ]);
});

test('waives the Building Official row only when the NCI commercial application says it is not applicable', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'building-official');
  const target = { ...application, appType: 'NCI', perType: 'Comm', existingBuildingAnswer: 'N/A' };
  await workflow.acceptApplication(target);
  await workflow.approveApplication(target);
  const saves = await page.evaluate(() => window.approvalState.saved);
  assert.deepEqual(saves.map(({ status, items }) => [status, items['building-official']]), [
    ['ACP', 'WOF'], ['APR', 'WOF'],
  ]);
});

test('does not guess Building Official approval status for an existing building or missing answer', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'building-official');
  for (const existingBuildingAnswer of ['Yes', undefined]) {
    const target = { ...application, appType: 'NCI', perType: 'Comm', existingBuildingAnswer };
    await assert.rejects(() => workflow.acceptApplication(target), /unresolved approval checklist.*ACP.*Approval by Building Official.*Pending/);
    assert.deepEqual(await page.evaluate(() => window.approvalState.saved), []);
    await page.locator('#statusDialog').evaluate(dialog => { dialog.hidden = true; });
  }
});

test('names an unrecognized pending checklist item and stops before saving approval', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'unknown-checklist');
  await workflow.acceptApplication(application);
  await assert.rejects(() => workflow.approveApplication(application), /unresolved approval checklist.*additional engineering review.*Pending/);
  assert.deepEqual(await page.evaluate(() => window.approvalState.saved.map(item => item.status)), ['ACP']);
});

test('handles NCI fee and payment rows by name across stage variants', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'variant-fee');
  await workflow.acceptApplication(application);
  await workflow.approveApplication(application);
  assert.deepEqual(await page.evaluate(() => window.approvalState.saved), [
    { status: 'ACP', items: { mandatory: 'CPT', 'review-a': 'CPT', additional: 'WOF' } },
    { status: 'APR', items: { fee: 'CPT', mandatory: 'CPT', additional: 'WOF' } },
  ]);
});

test('requires manual review for a pending contractor-license validation', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'license-validation');
  await assert.rejects(() => workflow.acceptApplication(application), /unresolved approval checklist.*ACP.*Validate Elevator Contractor License.*Pending/);
  assert.deepEqual(await page.evaluate(() => window.approvalState.saved), []);
});

test('reports an ALiS save rejection without saving twice', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'reject-approval');
  await workflow.acceptApplication(application);
  await assert.rejects(() => workflow.approveApplication(application), /ALiS rejected status APR.*Make sure that all required checklist items/i);
  assert.deepEqual(await page.evaluate(() => window.approvalState.saved.map(item => item.status)), ['ACP', 'APR']);
});

for (const resultMode of ['prefix-only', 'duplicate']) {
  test(`rejects ${resultMode} results without pulling or saving any row`, { timeout: 15_000 }, async (t) => {
    const { page, workflow } = await setup(t, resultMode);
    await assert.rejects(() => workflow.acceptApplication(application), /transaction|matching|duplicate/i);
    const state = await page.evaluate(() => window.approvalState);
    assert.deepEqual(state.searches, [['Conveyance', 'All', application.transactionNumber]]);
    assert.deepEqual(state.pulls, []);
    assert.deepEqual(state.opened, []);
    assert.deepEqual(state.saved, []);
  });
}
