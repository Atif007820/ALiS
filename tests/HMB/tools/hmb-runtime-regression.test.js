import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { HmbLoginApplyPage } from '../pages/HmbLoginApplyPage.js';
import { DocumentUploadComponent } from '../pages/DocumentUploadComponent.js';
import { check, clearBlockingOverlay, fill, waitAfterAction } from '../utils/formActions.js';

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

test('HMB recovers a resumed application from an empty completed section at Attestation', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  const application = new HmbLoginApplyPage(page);
  application.resumedPendingApplication = true;
  await page.setContent(`
    <main>
      <nav>
        <a id="owner" href="#owner">Owner, Director and Personnel</a>
        <a id="attestation" href="#attestation">Attestation</a>
      </nav>
      <section id="content"></section>
    </main>
    <script>
      document.querySelector('#owner').addEventListener('click', () => {
        document.querySelector('#content').innerHTML = '<button>Back</button><button>Next</button><button>Reset</button>';
      });
      document.querySelector('#attestation').addEventListener('click', () => {
        if (!confirm('You have unsaved changes.\\n\\nClick OK to discard the changes and continue on next page, or Cancel to stay on current page.')) return;
        document.querySelector('#content').innerHTML = '<h2>Attestation</h2><input aria-label="Operator*">';
      });
    </script>`);

  await application.fillOwnerDirectorPersonnel();

  assert.equal(await application.isAttestationPageVisible(), true);
  assert.equal(application.personnelDocumentsUploaded, 0);
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
