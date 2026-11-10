import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { appConfig } from '../../config/runConfig.js';
import { PermitApplicationPage } from '../../pages/PermitApplicationPage.js';
import { DocumentUploadComponent } from '../../pages/components/DocumentUploadComponent.js';
import { addApplyAnnotations } from '../../utils/annotations.js';

let browser;

before(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  appConfig.timeouts.expect = 1500;
  appConfig.timeouts.documentUploadResult = 1500;
  appConfig.documentUploadRetryLimit = 3;
});

after(async () => browser?.close());

test('reads, annotates and clicks the dynamic number in the confirmation message', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent(`
    <main><div>Confirmation</div><span>001234</span><div id="result"></div></main>
    <script>
      setTimeout(() => {
        document.querySelector('#result').innerHTML =
          'L&amp;I has received your permit application. Your online transaction number is <b>001234</b>.';
        document.querySelector('#result b').onclick = () => { window.clicked = true; };
      }, 100);
    </script>`);

  const permit = new PermitApplicationPage(page);
  await permit.expectConfirmation();
  const { transactionNumber, transactionText } = await permit.getConfirmationTransaction();
  const testInfo = { annotations: [] };
  addApplyAnnotations(testInfo, { transactionNumber });
  await transactionText.click();

  assert.equal(transactionNumber, '001234');
  assert.equal(await page.evaluate(() => window.clicked), true);
  assert.deepEqual(testInfo.annotations.find(({ type }) => type === 'Transaction Number'), {
    type: 'Transaction Number',
    description: '001234',
  });
});

test('rejects unrelated numbers when the confirmation has no transaction value', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent('<h2>Confirmation</h2><p>Application 700912 was received.</p><footer>2026</footer>');

  await assert.rejects(
    () => new PermitApplicationPage(page).getConfirmationTransaction(),
    /Confirmation must show an online transaction number/,
  );
});

async function setupUploadPage(page, mode) {
  await page.setContent(`
    <span id="mandatoryDoc00"><a id="mandatoryDoc0-2" href="javascript:void(0)">Documents (0)</a></span>
    <span id="mandatoryDoc01"><a id="mandatoryDoc1-2" href="javascript:void(0)">Documents (0)</a></span>`);
  await page.evaluate((mode) => {
    window.uploads = [];
    window.closeClicks = 0;
    document.querySelectorAll('a[id^="mandatoryDoc"]').forEach((row) => {
      row.onclick = () => {
        const dialog = document.createElement('mat-dialog-container');
        dialog.innerHTML = '<h2>Document Upload</h2><div id="validation"></div>' +
          '<input type="file"><textarea aria-label="comments"></textarea>' +
          '<button>Upload</button><button>Close</button>';
        document.body.append(dialog);
        const [upload, close] = dialog.querySelectorAll('button');
        close.onclick = () => {
          window.closeClicks++;
          dialog.remove();
        };
        upload.onclick = () => {
          window.uploads.push([row.id, dialog.querySelector('input').files[0]?.name]);
          if (mode === 'format') {
            dialog.querySelector('#validation').textContent = 'Invalid file format. Accepted formats are: [.pdf, .jpg, .doc]';
            return;
          }
          if (mode === 'missing' && window.uploads.length === 1) {
            dialog.querySelector('#validation').textContent = 'Please select file(s) for upload.';
            return;
          }
          dialog.remove();
          if (mode !== 'unconfirmed') setTimeout(() => { row.textContent = 'Documents (1)'; }, 100);
        };
      };
    });
  }, mode);
}

test('waits for the row count after auto close and preserves the file mapping on resume', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await setupUploadPage(page, 'success');
  const documents = new DocumentUploadComponent(page);

  assert.equal(await documents.uploadVisibleMandatoryDocuments(), 2);
  await page.locator('#mandatoryDoc1-2').evaluate((row) => { row.textContent = 'Documents (0)'; });
  assert.equal(await documents.uploadVisibleMandatoryDocuments(), 1);
  assert.deepEqual(await page.evaluate(() => window.uploads), [
    ['mandatoryDoc0-2', 'Text1.doc'],
    ['mandatoryDoc1-2', 'Text2.doc'],
    ['mandatoryDoc1-2', 'Text2.doc'],
  ]);
  assert.equal(await page.evaluate(() => window.closeClicks), 0);
});

for (const [mode, error] of [
  ['format', /Invalid file format/],
  ['unconfirmed', /The upload result is unconfirmed/],
]) {
  test(`stops after one ${mode} upload attempt`, { timeout: 10000 }, async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    await setupUploadPage(page, mode);

    await assert.rejects(() => new DocumentUploadComponent(page).uploadVisibleMandatoryDocuments(), error);
    assert.equal(await page.evaluate(() => window.uploads.length), 1);
  });
}

test('retries an explicit missing file rejection with a fresh upload dialog', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await setupUploadPage(page, 'missing');

  assert.equal(await new DocumentUploadComponent(page).uploadVisibleMandatoryDocuments(), 2);
  assert.deepEqual(await page.evaluate(() => window.uploads.map(([id]) => id)), [
    'mandatoryDoc0-2', 'mandatoryDoc0-2', 'mandatoryDoc1-2',
  ]);
  assert.equal(await page.evaluate(() => window.closeClicks), 1);
});
