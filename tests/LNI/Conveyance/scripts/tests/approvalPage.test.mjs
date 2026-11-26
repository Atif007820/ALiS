import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { appConfig } from '../../config/runConfig.js';
import { ApproveApplicationPage, chooseChecklistStatus } from '../../pages/ApproveApplicationPage.js';

const application = { transactionNumber: '009341', entityName: 'CONV_APPROVAL_FIXTURE' };
const permitNumber = '101216';
const credentials = { loginName: 'fixture-admin', password: 'FixtureOnly@123' };
let browser;

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  appConfig.timeouts.expect = 1_500;
  appConfig.timeouts.action = 1_500;
  appConfig.timeouts.workQueueSearch = 1_500;
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

function queueFixture(resultMode, lookup) {
  const permitLookup = lookup === 'permit';
  const delayedSearch = ['slow-search', 'stuck-search'].includes(resultMode);
  return `<!doctype html><meta charset="utf-8"><title>Conveyance Work Queue fixture</title>
    <main id="loginForm">
      <label>Login Name <input id="loginName"></label>
      <label>Password <input id="password" type="password" role="textbox"></label>
      <a id="login" href="#">Login</a>
    </main>
    <nav id="navigation" hidden>
      <span>Welcome Fixture Admin</span>
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
        <div role="listbox" hidden><button type="button" ${delayedSearch ? 'title="Conveyance"' : 'role="option"'}>Conveyance</button></div>
      </div>
      <div id="dependentFilters" ${delayedSearch ? 'hidden' : ''}>
        ${filterMarkup('assignedTo', 'Assigned To', 'ADMIN ADMIN', 'All')}
        <label>Transaction # <input id="transaction"></label>
        ${permitLookup ? '<label>Permit # <input id="permit"></label>' : ''}
      </div>
      <button id="search" type="button">Search</button>
      <a id="pull" href="#">Pull |</a>
      <table id="queueTable"><thead><tr><th>Select</th><th>Application ID</th><th><button>Conveyance #</button><span hidden>EqualsNot Equal</span></th><th>TXN # Filter</th><th>Entity Name</th><th>Application Type</th><th>Assigned Staff</th>${permitLookup ? '<th>Permit #</th>' : ''}</tr></thead><tbody id="results"></tbody></table>
    </main>
    <div id="pullDialog" role="dialog" aria-label="Confirm Pull" hidden><button id="confirmPull">OK</button></div>
    <div id="statusDialog" role="dialog" aria-label="modal" hidden>
      <div id="validation" hidden>
        <p>Please review following errors and correct them.</p>
        <ul><li>Make sure that all required checklist items are either completed or waived off.</li></ul>
      </div>
      <table><tbody id="checklist"></tbody></table>
      <label for="applicationStatus">Application Status</label>
      <select id="applicationStatus"><option value=""></option><option value="PEN">Pending</option><option value="ACP">Accepted</option><option value="APR">Approved</option></select>
      <button id="saveStatus">Save</button>
    </div>
    <script>
      const app = ${JSON.stringify(application)};
      const permitNumber = ${JSON.stringify(permitNumber)};
      const resultMode = ${JSON.stringify(resultMode)};
      const delayedSearch = ${delayedSearch};
      const byId = (id) => document.getElementById(id);
      const state = window.approvalState = {
        loggedIn: false, searches: [], filterChanges: [], transactionChanges: [], pulls: [], opened: [], saved: [], closedDialogs: 0,
      };
      byId('transaction').addEventListener('input', event => { state.transactionChanges.push(event.target.value); });
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
        list.firstElementChild.onclick = () => {
          valueControl.value = list.firstElementChild.textContent;
          state.filterChanges.push([id, valueControl.value]);
          list.hidden = true;
          if (id === 'businessUnit') byId('dependentFilters').hidden = false;
        };
      }
      byId('search').onclick = () => {
        const permitField = byId('permit');
        const filters = [
          byId('businessUnit').querySelector('input').value,
          byId('assignedTo').value,
          byId('transaction').value,
          ...(permitField ? [permitField.value] : []),
        ];
        state.searches.push(filters);
        const expected = permitField ? ['Conveyance', 'All', '', permitNumber] : ['Conveyance', 'All', app.transactionNumber];
        if (filters.join('|') !== expected.join('|')) return;
        // The same entity can have multiple transactions; its name alone is not safe.
        // The unrelated application repeats the exact requested number in its
        // Application ID column. Only the Transaction # column identifies a match.
        const targetRow = ['target', 'APP-2026-0001', app.transactionNumber, app.entityName];
        const unrelated = ['unrelated', app.transactionNumber, app.transactionNumber + '0', app.entityName];
        const rows = [];
        if (permitField) {
          rows.push(['hidden-result', 'APP-2026-0000', '009339', app.entityName]);
          // The same permit appears on two transactions. Move the originally selected row after acceptance.
          rows.push(...(state.saved.length ? [unrelated, targetRow] : [targetRow, unrelated]));
        } else {
          rows.push(unrelated);
          if (resultMode !== 'prefix-only') rows.push(targetRow);
          if (resultMode === 'duplicate') rows.push(['duplicate', 'APP-2026-0002', app.transactionNumber, app.entityName]);
        }
        if (delayedSearch) {
          // Keep an actionable stale row on screen until the new result has arrived.
          const staleNumber = permitField ? '009339' : app.transactionNumber;
          byId('queueTable').setAttribute('aria-busy', 'true');
          renderRows([['stale', 'APP-2026-STALE', staleNumber, 'STALE_APPLICANT']], permitField);
          if (resultMode === 'stuck-search') return;
          setTimeout(() => {
            renderRows(rows, permitField);
            byId('queueTable').setAttribute('aria-busy', 'false');
          }, 500);
        } else {
          renderRows(rows, permitField);
        }
      };
      function renderRows(rows, permitField) {
        byId('results').replaceChildren(...rows.map(([key, applicationId, number, name]) => {
          const row = document.createElement('tr');
          row.dataset.key = key;
          row.hidden = key === 'hidden-result';
          row.innerHTML = '<td><input type="checkbox" aria-label="checkbox"></td><td></td><td></td><td></td><td><a href="#"></a></td><td></td><td></td>';
          row.cells[1].textContent = applicationId;
          row.cells[2].textContent = key === 'target' ? '001563' : '001562';
          row.cells[3].textContent = number;
          row.cells[5].textContent = resultMode === 'alteration' ? 'Conveyance Alteration' : resultMode === 'variance' ? 'Conveyance Variance'
            : resultMode.startsWith('hoist') ? 'Construction Hoist' : resultMode === 'unknown-type'
              ? 'Unrecognized Application' : 'New Conveyance Installation';
          const alreadyAssigned = ['variance', 'alteration', 'permit-already-approved'].includes(resultMode);
          row.cells[6].textContent = alreadyAssigned ? 'Fixture Admin' : '';
          row.querySelector('a').textContent = name;
          row.querySelector('a').onclick = (event) => {
            event.preventDefault();
            state.opened.push(key);
            if (key === 'target' && (alreadyAssigned || state.pulls.at(-1)?.join() === 'target')) openStatus();
          };
          if (permitField) {
            const permitLink = document.createElement('a');
            permitLink.href = '#';
            permitLink.textContent = permitNumber;
            permitLink.onclick = (event) => { event.preventDefault(); state.opened.push('permit-link'); };
            row.insertCell().append(permitLink);
          }
          return row;
        }));
      }
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
        if (resultMode.startsWith('hoist')) {
          items = state.saved.length === 0 && resultMode !== 'hoist-technical'
            ? [['payment', '3 All (State Only) Ensure payment linked to permit #'],
              ['additional', '1 All Additional Supporting Document(s)'],
              ['fee', '2 All (State Only) Review Application Fee']]
            : [['additional', '1 All Additional Supporting Document(s)']];
        }
        if (resultMode === 'variance') {
          items = state.saved.length === 0
            ? [['mandatory', '4 All (State Only) Mandatory Required Documents'], ['additional', '2 All Additional Supporting Documents'],
              ['ensure', '1 All (State Only) Ensure payment linked to permit #'], ['review', '3 All (State Only) Review Application Fee']]
            : [['mandatory', '2 All (State Only) Mandatory Required Documents'], ['additional', '1 All Additional Supporting Documents']];
        }
        if (resultMode === 'alteration') {
          items = state.saved.length === 0
            ? [['ensure', '7 All (State Only) Ensure payment linked to permit #'], ['review', '9 All (State Only) Review Application Fee'],
              ['additional', '6 All Additional Supporting Documents']]
            : [['additional', '1 All Additional Supporting Documents']];
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
        const initialStatus = resultMode === 'permit-already-approved' ? 'APR' : resultMode === 'hoist-technical' ? 'ACP' : 'PEN';
        byId('applicationStatus').value = state.saved.at(-1)?.status || initialStatus;
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

async function setup(t, resultMode = 'default', pickIndex, lookup) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  t.after(() => context.close());
  // Fulfill the configured login URL locally. No other request can reach the portal.
  await context.route('**/*', (route) => {
    if (route.request().isNavigationRequest() && new URL(route.request().url()).pathname.endsWith('/LoginCMS.aspx')) {
      return route.fulfill({ contentType: 'text/html', body: queueFixture(resultMode, lookup) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(2_000);
  page.setDefaultNavigationTimeout(10_000);
  const workflow = new ApproveApplicationPage(page, { pickIndex });
  await workflow.openWorkQueue(credentials, { lookup });
  return { page, workflow };
}

function assertChecklistSaves(actual, expected) {
  assert.deepEqual(actual.map(({ status, items }) => {
    for (const value of Object.values(items)) assert.ok(['CPT', 'WOF'].includes(value));
    return [status, ...Object.keys(items).sort()];
  }), expected.map(([status, ...keys]) => [status, ...keys.sort()]));
}

test('checklist selection randomizes enabled terminal statuses and never selects Pending', () => {
  assert.equal(chooseChecklistStatus(['CPT', 'WOF', 'PEN'], () => 0), 'CPT');
  assert.equal(chooseChecklistStatus(['CPT', 'WOF', 'PEN'], () => 1), 'WOF');
  assert.equal(chooseChecklistStatus(['WOF', 'PEN'], () => assert.fail('no random choice')), 'WOF');
  assert.equal(chooseChecklistStatus(['CPT', 'PEN'], () => assert.fail('no random choice')), 'CPT');
  assert.equal(chooseChecklistStatus(['PEN']), undefined);
});

for (const [variant, appType, expected, choice] of [
  ['default', 'NCI', ['ACP', 'APR'], 1],
  ['hoist-technical', 'CHI', ['APR'], 0],
  ['variance', 'CV', ['ACP', 'APR'], 0],
  ['alteration', 'CA', ['ACP', 'APR'], 1],
]) {
  test(`approval-only detects ${appType} and saves only the required review stages`, { timeout: 25_000 }, async (t) => {
    const { page, workflow } = await setup(t, variant, () => choice);
    const result = await workflow.approveExistingTransaction(application.transactionNumber);
    assert.equal(result.appType, appType);
    const state = await page.evaluate(() => window.approvalState);
    assert.deepEqual(state.opened, expected.map(() => 'target'));
    assert.deepEqual(state.saved.map(({ status }) => status), expected);
    for (const { items } of state.saved) {
      assert.ok(Object.keys(items).length > 0);
      assert.ok(Object.values(items).every(value => value === ['CPT', 'WOF'][choice]));
    }
    if (appType === 'CA') assertChecklistSaves(state.saved, [['ACP', 'ensure', 'review', 'additional'], ['APR', 'additional']]);
  });
}

test('approval-only refuses an unknown application type before pulling a task', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'unknown-type');
  await assert.rejects(() => workflow.approveExistingTransaction(application.transactionNumber), /Unsupported Work Queue application type/);
  const state = await page.evaluate(() => window.approvalState);
  assert.deepEqual(state.pulls, []);
  assert.deepEqual(state.saved, []);
});

test('permit approval uses the first visible result and retains its exact transaction after acceptance', { timeout: 25_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'default', () => 0, 'permit');
  const result = await workflow.approveExistingPermit(permitNumber);

  assert.equal(result.permitNumber, permitNumber);
  assert.equal(result.transactionNumber, application.transactionNumber);
  assert.equal(result.appType, 'NCI');
  assert.equal(result.entityName, application.entityName);
  const state = await page.evaluate(() => window.approvalState);
  assert.deepEqual(state.searches, [
    ['Conveyance', 'All', '', permitNumber],
    ['Conveyance', 'All', '', permitNumber],
  ]);
  assert.deepEqual(state.transactionChanges, []);
  assert.deepEqual(state.pulls, [['target'], ['target']]);
  assert.deepEqual(state.opened, ['target', 'target']);
  assertChecklistSaves(state.saved, [
    ['ACP', 'mandatory', 'review-a', 'review-b', 'ensure', 'additional'],
    ['APR', 'mandatory', 'additional'],
  ]);
});

test('permit approval skips Pull and Save for an assigned transaction already approved', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'permit-already-approved', () => 0, 'permit');
  const result = await workflow.approveExistingPermit(permitNumber);

  assert.equal(result.permitNumber, permitNumber);
  assert.equal(result.transactionNumber, application.transactionNumber);
  assert.equal(result.alreadyApproved, true);
  const state = await page.evaluate(() => window.approvalState);
  assert.deepEqual(state.searches, [['Conveyance', 'All', '', permitNumber]]);
  assert.deepEqual(state.transactionChanges, []);
  assert.deepEqual(state.pulls, []);
  assert.deepEqual(state.opened, ['target']);
  assert.deepEqual(state.saved, []);
});

for (const lookup of ['permit', 'transaction']) {
  test(`${lookup} approval sets Work Queue filters before lookup and waits for fresh Search results`, { timeout: 25_000 }, async (t) => {
    const { page, workflow } = await setup(t, 'slow-search', () => 0, lookup);
    const result = lookup === 'permit'
      ? await workflow.approveExistingPermit(permitNumber)
      : await workflow.approveExistingTransaction(application.transactionNumber);

    assert.equal(result.transactionNumber, application.transactionNumber);
    assert.equal(result.entityName, application.entityName);
    const state = await page.evaluate(() => window.approvalState);
    assert.deepEqual(state.filterChanges, [['businessUnit', 'Conveyance'], ['assignedTo', 'All']]);
    const expectedSearch = lookup === 'permit'
      ? ['Conveyance', 'All', '', permitNumber]
      : ['Conveyance', 'All', application.transactionNumber];
    assert.deepEqual(state.searches, [expectedSearch, expectedSearch]);
    if (lookup === 'permit') assert.deepEqual(state.transactionChanges, []);
    assert.deepEqual(state.pulls, [['target'], ['target']]);
    assert.deepEqual(state.opened, ['target', 'target']);
    assert.deepEqual(state.saved.map(({ status }) => status), ['ACP', 'APR']);
  });
}

test('permit approval stops without touching the stale row when Work Queue Search times out', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'stuck-search', () => 0, 'permit');
  await assert.rejects(() => workflow.approveExistingPermit(permitNumber), /work queue|search|busy/i);

  const state = await page.evaluate(() => window.approvalState);
  assert.deepEqual(state.searches, [['Conveyance', 'All', '', permitNumber]]);
  assert.deepEqual(state.transactionChanges, []);
  assert.deepEqual(state.pulls, []);
  assert.deepEqual(state.opened, []);
  assert.deepEqual(state.saved, []);
});

test('accepts then approves only the exact transaction with the correct checklist statuses', { timeout: 25_000 }, async (t) => {
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
  assertChecklistSaves(state.saved, [
    ['ACP', 'mandatory', 'review-a', 'review-b', 'ensure', 'additional'],
    ['APR', 'mandatory', 'additional'],
  ]);
  assert.equal(state.closedDialogs, 2);
});

test('resolves the Commercial Blind Hoistway checklist item before approval', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'commercial');
  await workflow.acceptApplication(application);
  await workflow.approveApplication(application);
  const state = await page.evaluate(() => window.approvalState);
  assertChecklistSaves(state.saved.slice(-1), [['APR', 'blind-hoistway', 'mandatory', 'additional']]);
  assert.equal(state.closedDialogs, 2);
});

test('accepts and approves a hoist transaction without requiring an NCI plan row', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'hoist');
  const target = { ...application, appType: 'CHI', perType: 'CMH(A10.5)' };
  await workflow.acceptApplication(target);
  await workflow.approveApplication(target);
  assertChecklistSaves(await page.evaluate(() => window.approvalState.saved), [
    ['ACP', 'payment', 'fee', 'additional'],
    ['APR', 'additional'],
  ]);
});

test('CV approval checks the conveyance number before pull and uses its own checklist', { timeout: 20_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'variance');
  const target = { transactionNumber: application.transactionNumber, appType: 'CV', conveyanceNumber: '001563' };
  await assert.rejects(() => workflow.acceptApplication({ ...target, conveyanceNumber: '001562' }), /does not belong/);
  assert.deepEqual(await page.evaluate(() => window.approvalState.pulls), []);
  const entityName = await workflow.acceptApplication(target);
  await workflow.approveApplication({ ...target, entityName });
  assert.deepEqual(await page.evaluate(() => window.approvalState.pulls), []);
  assertChecklistSaves(await page.evaluate(() => window.approvalState.saved), [
    ['ACP', 'mandatory', 'ensure', 'review', 'additional'],
    ['APR', 'mandatory', 'additional'],
  ]);
});

for (const [choice, status] of [[0, 'CPT'], [1, 'WOF']]) {
  test(`standalone approval selects ${status} for Building Official in both NCI review stages`, { timeout: 15_000 }, async (t) => {
    const { page, workflow } = await setup(t, 'building-official', () => choice);
    const result = await workflow.approveExistingTransaction(application.transactionNumber);
    assert.equal(result.appType, 'NCI');

    const saves = await page.evaluate(() => window.approvalState.saved);
    assert.deepEqual(saves.map(({ status: savedStatus, items }) => [savedStatus, items['building-official']]), [
      ['ACP', status], ['APR', status],
    ]);
    assertChecklistSaves(saves, [
      ['ACP', 'building-official', 'mandatory', 'review-a', 'review-b', 'ensure', 'additional'],
      ['APR', 'building-official', 'mandatory', 'additional'],
    ]);
  });
}

test('combined NCI approval handles Building Official through the standard checklist selection', { timeout: 15_000 }, async (t) => {
  const { page, workflow } = await setup(t, 'building-official', () => 0);
  const target = { ...application, appType: 'NCI', perType: 'Comm', existingBuildingAnswer: 'Yes' };
  await workflow.acceptApplication(target);
  await workflow.approveApplication(target);

  const saves = await page.evaluate(() => window.approvalState.saved);
  assert.deepEqual(saves.map(({ status, items }) => [status, items['building-official']]), [
    ['ACP', 'CPT'], ['APR', 'CPT'],
  ]);
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
  assertChecklistSaves(await page.evaluate(() => window.approvalState.saved), [
    ['ACP', 'mandatory', 'review-a', 'additional'],
    ['APR', 'fee', 'mandatory', 'additional'],
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
