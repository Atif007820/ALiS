import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { HmbLoginApplyPage } from '../pages/HmbLoginApplyPage.js';
import { DocumentUploadComponent } from '../pages/DocumentUploadComponent.js';
import { check, clearBlockingOverlay, fill, waitAfterAction } from '../utils/formActions.js';
import { mergeLoginCredentials, registeredUserPath } from '../utils/userStore.js';

test('HMB stores registered accounts separately for each browser project', () => {
  const chromiumPath = registeredUserPath('chromium');
  const edgePath = registeredUserPath('msedge');

  assert.notEqual(chromiumPath, edgePath);
  assert.equal(path.dirname(chromiumPath), path.dirname(edgePath));
  assert.match(path.basename(chromiumPath), /\.chromium\.json$/);
  assert.match(path.basename(edgePath), /\.msedge\.json$/);
});

test('HMB standalone Apply accepts configured credentials without a saved account', () => {
  assert.deepEqual(
    mergeLoginCredentials(null, { loginName: 'configured-user', password: 'configured-password' }),
    { loginName: 'configured-user', password: 'configured-password' },
  );
});

test('HMB standalone Apply overrides only configured credentials on a saved account', () => {
  const savedUser = {
    loginName: 'registered-user',
    password: 'registered-password',
    entityName: 'Saved Entity',
  };

  assert.deepEqual(
    mergeLoginCredentials(savedUser, { loginName: 'configured-user' }),
    { ...savedUser, loginName: 'configured-user' },
  );
  assert.deepEqual(mergeLoginCredentials(savedUser), savedUser);
});

test('HMB application entry waits for the delayed Angular list-item menu', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent('<main><ul id="dashboard-menu"></ul></main>');

  await page.evaluate(() => {
    setTimeout(() => {
      document.querySelector('#dashboard-menu').innerHTML = `
        <li id="apply"><span>NL</span><span>Apply for RA-HMB</span></li>`;
      document.querySelector('#apply').addEventListener('click', () => {
        document.querySelector('main').innerHTML = '<label><input type="radio"> Initial Registration</label>';
      });
    }, 250);
  });

  await application.openApplication();
  assert.equal(await page.getByRole('radio', { name: /Initial Registration/i }).isVisible(), true);
});

test('HMB application entry retains semantic link support', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <a href="#apply">Apply for RA-HMB</a>
    <script>document.querySelector('a').addEventListener('click', () => {
      document.body.innerHTML = '<label><input type="radio"> Initial Registration</label>';
    });</script>`);

  await application.openApplication();
  assert.equal(await page.getByRole('radio', { name: /Initial Registration/i }).isVisible(), true);
});

test('HMB fresh registration skips pending-application probes', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.setContent('<a href="#apply">Apply for RA-HMB</a>');
  const application = new HmbLoginApplyPage(page);
  const requestedActions = [];
  const portalAction = application.portalAction.bind(application);
  application.portalAction = async (name, options) => {
    requestedActions.push(name);
    return portalAction(name, options);
  };
  application.isApplicationScreenVisible = async () => true;

  await application.openApplication({ freshRegistration: true });

  assert.equal(requestedActions.length, 1);
});

test('HMB opens named application sections instead of relying on page-wide Next order', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <main>
      <a href="#address">Address Information</a>
      <a href="#owner">Owner, Director and Personnel</a>
      <button>Next</button><button>Next</button>
      <p>Please review Information for accuracy.</p>
    </main>
    <script>
      document.querySelector('a[href="#owner"]').addEventListener('click', () => {
        document.querySelector('main').innerHTML = '<section id="divOwnershipInfo"><a>Add</a></section>';
      });
    </script>`);

  const owner = page.locator('#divOwnershipInfo');
  await application.openApplicationSection('Owner, Director and Personnel', owner, { timeout: 5000 });
  assert.equal(await owner.isVisible(), true);
});

test('HMB resumes the current Angular grid application when no Continue link is rendered', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <main>
      <li id="pending-menu">View Pending Online Application(s)</li>
      <div role="row" id="incomplete">Initial Registration and Accreditation by Deemed Status — Incomplete</div>
    </main>
    <script>
      document.querySelector('#incomplete').addEventListener('click', () => {
        document.querySelector('main').innerHTML = '<label><input type="radio"> Initial Registration</label>';
      });
    </script>`);

  await application.openPendingApplication();
  assert.equal(await page.getByRole('radio', { name: /Initial Registration/i }).isVisible(), true);
});

test('HMB keeps Ownership and Personnel dialogs isolated when both Angular modals are present', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <div role="dialog"><ownership-details><input aria-label="Last Name"><button>Save</button></ownership-details></div>
    <div role="dialog"><agency-personnel-detail><input aria-label="Last Name"><input type="radio" aria-label="HMB ADMINISTRATOR"><button>Save</button></agency-personnel-detail></div>`);

  const owner = await application.visibleOwnershipDialog();
  const personnel = await application.visiblePersonnelDialog();

  assert.equal(await owner.evaluate((element) => element.tagName), 'OWNERSHIP-DETAILS');
  assert.equal(await personnel.evaluate((element) => element.tagName), 'AGENCY-PERSONNEL-DETAIL');
  assert.equal(await personnel.getByRole('radio', { name: 'HMB ADMINISTRATOR' }).isVisible(), true);
});

test('HMB stops mandatory uploads when the application advances to Attestation', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <main>
      <section id="MandatoryDocument">
        <a id="mandatoryDoc0-0">Documents (0)</a>
        <a id="mandatoryDoc1-0">Documents (0)</a>
      </section>
    </main>`);

  const uploadedIds = [];
  application.documents.uploadFromLink = async (link) => {
    const id = await link.getAttribute('id');
    uploadedIds.push(id);
    if (id === 'mandatoryDoc1-0') {
      await page.locator('main').evaluate((element) => {
        element.innerHTML = '<h2>Attestation</h2>';
      });
    } else {
      await link.evaluate((element) => { element.textContent = 'Documents (1)'; });
    }
  };

  const uploaded = await application.uploadMandatoryDocuments();

  assert.equal(uploaded, 2);
  assert.deepEqual(uploadedIds, ['mandatoryDoc0-0', 'mandatoryDoc1-0']);
  assert.equal(await application.isAttestationPageVisible(), true);
});

test('HMB waits for asynchronously rendered mandatory rows and finds them without legacy IDs', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.setContent(`
    <main>
      <h2>Mandatory Required Document(S)</h2>
      <table><tbody id="documents"></tbody></table>
      <div><span id="page">Page 1 of 2</span><button id="next" aria-label="next">next</button></div>
    </main>
    <script>
      const renderRows = (first, last) => {
        document.querySelector('#documents').innerHTML = Array.from({ length: last - first + 1 }, (_, index) => {
          const item = first + index;
          return '<tr><td>' + item + '</td><td>RA-HMB</td><td>Document ' + item + '</td><td><a href="#upload">Documents (0)</a></td></tr>';
        }).join('');
      };
      setTimeout(() => renderRows(1, 5), 150);
      document.querySelector('#next').addEventListener('click', () => {
        setTimeout(() => {
          renderRows(6, 7);
          document.querySelector('#page').textContent = 'Page 2 of 2';
        }, 200);
      });
    </script>`);

  const application = new HmbLoginApplyPage(page);
  const firstDocument = await application.ensureMandatoryDocumentLink('mandatoryDoc0-0');
  assert.equal(await firstDocument.innerText(), 'Documents (0)');

  const sixthDocument = await application.ensureMandatoryDocumentLink('mandatoryDoc5-0');
  assert.equal(await sixthDocument.innerText(), 'Documents (0)');
  assert.equal(await page.getByText('Page 2 of 2').isVisible(), true);
});

test('HMB mandatory paging never clicks unrelated page-wide controls', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  await page.setContent(`
    <main>
      <button id="unrelated-next">Next</button>
      <script>
        window.unrelatedClicks = 0;
        document.querySelector('#unrelated-next').addEventListener('click', () => window.unrelatedClicks += 1);
      </script>
    </main>`);

  assert.equal(await application.clickMandatoryPager('next'), false);
  assert.equal(await page.evaluate(() => window.unrelatedClicks), 0);
});

test('HMB recovers a resumed application through Additional Information before Attestation', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  application.resumedPendingApplication = true;
  await page.setContent(`
    <main>
      <nav>
        <a id="owner" href="#owner">Owner, Director and Personnel</a>
        <a id="additional" href="#additional">Additional Information</a>
        <a id="attestation" href="#attestation">Attestation</a>
      </nav>
      <section id="content"></section>
    </main>
    <script>
      document.querySelector('#owner').addEventListener('click', () => {
        document.querySelector('#content').innerHTML = '<button>Back</button><button>Next</button><button>Reset</button>';
      });
      document.querySelector('#additional').addEventListener('click', () => {
        if (!confirm('You have unsaved changes.\\n\\nClick OK to discard the changes and continue on next page, or Cancel to stay on current page.')) return;
        document.querySelector('#content').innerHTML = '<h2>Mandatory Required Document(S)</h2><table><tbody><tr><td>1</td><td>Document</td><td><a href="#upload">Documents (0)</a></td></tr></tbody></table>';
      });
    </script>`);

  await application.fillOwnerDirectorPersonnel();

  assert.equal(await application.isMandatoryDocumentsPageVisible(), true);
  assert.equal(application.personnelDocumentsUploaded, 0);
});

test('HMB fails when the fee service rejects lookup and payment action is absent', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.route('**/FeeDetail', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<h1>Fee Detail</h1><script>
      fetch('/api/Common/GetApplicationFee', { method: 'POST' });
    </script>`,
  }));
  await page.route('**/GetApplicationFee', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: '{"error":"not found"}',
  }));
  await page.setContent('<h1>Submitted</h1>');

  const application = new HmbLoginApplyPage(page);
  await assert.rejects(
    () => application.completePayment({ required: true }),
    /GetApplicationFee returned HTTP 404/,
  );
});

test('HMB retries transient Fee Detail API failures and continues when payment becomes available', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  let feeLookupAttempts = 0;
  await page.route('**/FeeDetail', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<h1>Fee Detail</h1><script>
      fetch('/api/Common/GetApplicationFee', { method: 'POST' }).then((response) => {
        if (response.ok) document.body.insertAdjacentHTML('beforeend', '<button>Submit Application and Pay By Credit Card</button>');
      });
    </script>`,
  }));
  await page.route('**/GetApplicationFee', async (route) => {
    feeLookupAttempts += 1;
    await route.fulfill({
      status: feeLookupAttempts === 1 ? 500 : 200,
      contentType: 'application/json',
      body: feeLookupAttempts === 1 ? '{"error":"temporary"}' : '{}',
    });
  });
  await page.setContent('<h1>Submitted</h1>');

  const application = new HmbLoginApplyPage(page);
  application.captureTransactionNumber = async () => '12345';
  const transaction = await application.completePayment({ required: true });

  assert.equal(transaction, '12345');
  assert.equal(feeLookupAttempts, 2);
});

test('HMB reports persistent Fee Detail API 500 responses with actionable diagnostics', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  let feeLookupAttempts = 0;
  await page.route('**/FeeDetail', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<h1>Fee Detail</h1><script>
      fetch('/api/Common/GetApplicationFee', { method: 'POST' });
    </script>`,
  }));
  await page.route('**/GetApplicationFee', async (route) => {
    feeLookupAttempts += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"temporary"}' });
  });
  await page.setContent('<h1>Submitted</h1>');

  const application = new HmbLoginApplyPage(page);
  await assert.rejects(
    () => application.completePayment({ required: true }),
    /GetApplicationFee returned HTTP 500 after 3 attempts.*fee service is failing/s,
  );
  assert.equal(feeLookupAttempts, 3);
});

test('HMB fails when payment click has no transaction confirmation', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.route('**/FeeDetail', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<h1>Fee Detail</h1><button>Submit Application and Pay By Credit Card</button>',
  }));
  await page.setContent('<h1>Submitted</h1>');

  const application = new HmbLoginApplyPage(page);
  application.captureTransactionNumber = async () => 'Not captured';
  await assert.rejects(
    () => application.completePayment({ required: true }),
    /no transaction or receipt confirmation was found/,
  );
});

test('HMB waits for all loading overlays, including one matching multiple selectors', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <div id="overlay" class="blockUI blockOverlay">Saving</div>
    <div class="k-loading-mask">Refreshing</div>`);
  await page.evaluate(() => {
    window.completedLoads = 0;
    [document.querySelector('#overlay'), document.querySelector('.k-loading-mask')].forEach((element, index) => {
      setTimeout(() => {
        element.hidden = true;
        window.completedLoads += 1;
      }, 100 + index * 300);
    });
  });

  await clearBlockingOverlay(page);
  assert.equal(await page.evaluate(() => window.completedLoads), 2);
  assert.equal(await page.locator('#overlay').evaluate((element) => element.style.pointerEvents), '');
});

test('HMB readiness waits for a postback without blocking on Angular background timers', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<p>Loading form</p>');
  await page.evaluate(() => {
    window.postbackPending = true;
    window.angularStable = false;
    window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({
      get_isInAsyncPostBack: () => window.postbackPending,
    }) } } };
    window.getAllAngularTestabilities = () => [{ isStable: () => window.angularStable }];
    setTimeout(() => { window.postbackPending = false; }, 400);
  });

  await waitAfterAction(page);
  assert.deepEqual(await page.evaluate(() => [window.postbackPending, window.angularStable]), [false, false]);
});

test('HMB fill still waits for a disabled field to become editable', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input aria-label="Contact" disabled>');
  await page.evaluate(() => {
    setTimeout(() => { document.querySelector('input').disabled = false; }, 300);
  });

  await fill(page, page.getByRole('textbox', { name: 'Contact' }), 'Updated contact');
  assert.equal(await page.getByRole('textbox', { name: 'Contact' }).inputValue(), 'Updated contact');
});

test('HMB selects a covered Material radio through its associated label fallback', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <mat-radio-button style="display:block;position:relative">
      <input id="role" type="radio" style="position:absolute;left:0;top:0">
      <div class="mat-mdc-radio-touch-target" style="position:relative;background:white;width:40px;height:40px"></div>
      <label for="role"><label>Administrator</label></label>
    </mat-radio-button>`);

  await check(page, page.getByRole('radio', { name: 'Administrator' }), { timeout: 1500 });
  assert.equal(await page.getByRole('radio', { name: 'Administrator' }).isChecked(), true);
});

for (const deferredInput of [false, true]) {
  test(`HMB uploads through ${deferredInput ? 'a file chooser when required' : 'an existing file input directly'}`, async (t) => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    let chooserEvents = 0;
    page.on('filechooser', () => { chooserEvents += 1; });
    await page.setContent(`
      <div role="dialog">
        <h2>Upload document</h2><a href="#add">Add</a>
        ${deferredInput ? '' : '<input type="file" hidden>'}
        <button id="file">file</button>
        <input aria-label="Comments">
        <button id="upload">Upload</button><button id="close">Close</button>
      </div>
      <script>
        document.querySelector('#file').onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.hidden = true;
          document.querySelector('[role="dialog"]').append(input);
          input.click();
        };
        document.querySelector('#upload').onclick = () => {
          window.uploaded = {
            file: document.querySelector('input[type="file"]').files[0].name,
            comment: document.querySelector('input[aria-label="Comments"]').value,
          };
        };
        document.querySelector('#close').onclick = () => document.querySelector('[role="dialog"]').remove();
      </script>`);

    await new DocumentUploadComponent(page).uploadVisibleFile(
      fileURLToPath(new URL('../Documents/Text1.doc', import.meta.url)), 'Upload verification',
    );
    assert.deepEqual(await page.evaluate(() => window.uploaded), { file: 'Text1.doc', comment: 'Upload verification' });
    assert.equal(chooserEvents, deferredInput ? 1 : 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
}
