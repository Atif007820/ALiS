import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { appConfig } from '../../config/runConfig.js';
import { PermitApplicationPage } from '../../pages/PermitApplicationPage.js';
import { DocumentUploadComponent } from '../../pages/components/DocumentUploadComponent.js';
import { ConveyanceFollowUpPage } from '../../pages/ConveyanceFollowUpPage.js';
import { addApplyAnnotations } from '../../utils/annotations.js';
import { listUploadFiles } from '../../utils/uploadFilePool.js';

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

function uploadDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'conveyance-upload-'));
  t.after(() => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) rmdirSync(path);
      else unlinkSync(path);
    }
    rmdirSync(directory);
  });
  for (let i = 1; i <= 4; i++) writeFileSync(join(directory, `Text${i}.doc`), 'TEST document');
  return directory;
}

async function setupUploadPage(page, mode, count = 2) {
  await page.setContent(Array.from({ length: count }, (_, i) =>
    `<span><a id="mandatoryDoc${i}-2" href="javascript:void(0)">Documents (0)</a></span>`).join(''));
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
  await setupUploadPage(page, 'success', 4);
  const documents = new DocumentUploadComponent(page, { directory: uploadDirectory(t), pickIndex: count => count - 1 });

  assert.equal(await documents.uploadVisibleMandatoryDocuments(), 4);
  await page.locator('#mandatoryDoc1-2').evaluate((row) => { row.textContent = 'Documents (0)'; });
  assert.equal(await documents.uploadVisibleMandatoryDocuments(), 1);
  assert.deepEqual(await page.evaluate(() => window.uploads), [
    ['mandatoryDoc0-2', 'Text4.doc'],
    ['mandatoryDoc1-2', 'Text3.doc'],
    ['mandatoryDoc2-2', 'Text2.doc'],
    ['mandatoryDoc3-2', 'Text1.doc'],
    ['mandatoryDoc1-2', 'Text3.doc'],
  ]);
  assert.equal(await page.evaluate(() => window.closeClicks), 0);
});

test('discovers regular upload files and ignores hidden files, lock files, and directories', t => {
  const directory = uploadDirectory(t);
  writeFileSync(join(directory, '.keep'), '');
  writeFileSync(join(directory, '~$Text1.doc'), '');
  mkdirSync(join(directory, 'subdirectory'));
  assert.deepEqual(listUploadFiles(directory).map(file => basename(file)), ['Text1.doc', 'Text2.doc', 'Text3.doc', 'Text4.doc']);
  assert.throws(() => listUploadFiles(join(directory, 'subdirectory')), /No upload files found/);
});

test('variance and alteration supporting documents use the shared random file pool', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await setupUploadPage(page, 'success', 1);
  const followUp = new ConveyanceFollowUpPage(page);
  followUp.documents = new DocumentUploadComponent(page, { directory: uploadDirectory(t), pickIndex: () => 2 });
  await followUp.uploadSupportingDocument('TEST follow-up');
  assert.deepEqual(await page.evaluate(() => window.uploads), [['mandatoryDoc0-2', 'Text3.doc']]);
});

for (const [mode, error] of [
  ['format', /Invalid file format/],
  ['unconfirmed', /The upload result is unconfirmed/],
]) {
  test(`stops after one ${mode} upload attempt`, { timeout: 10000 }, async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    await setupUploadPage(page, mode);

    const documents = new DocumentUploadComponent(page, { directory: uploadDirectory(t) });
    await assert.rejects(() => documents.uploadVisibleMandatoryDocuments(), error);
    assert.equal(await page.evaluate(() => window.uploads.length), 1);
  });
}

test('retries an explicit missing file rejection with a fresh upload dialog', { timeout: 10000 }, async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await setupUploadPage(page, 'missing');

  const documents = new DocumentUploadComponent(page, { directory: uploadDirectory(t), pickIndex: count => count - 1 });
  assert.equal(await documents.uploadVisibleMandatoryDocuments(), 2);
  assert.deepEqual(await page.evaluate(() => window.uploads), [
    ['mandatoryDoc0-2', 'Text4.doc'], ['mandatoryDoc0-2', 'Text4.doc'], ['mandatoryDoc1-2', 'Text3.doc'],
  ]);
  assert.equal(await page.evaluate(() => window.closeClicks), 1);
});
