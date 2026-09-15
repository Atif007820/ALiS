import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { HmbLoginApplyPage } from '../pages/HmbLoginApplyPage.js';

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
