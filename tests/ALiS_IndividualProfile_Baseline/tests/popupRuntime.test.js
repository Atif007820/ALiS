import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { runUiActions } from '../utils/uiActions.js';
import { saveCreatedProfile } from '../flows/CreateEntityFlow.js';
import { baselineConfig } from '../config/baseline.config.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('credential radio cleared by a delayed postback is restored before OK and parent callback finishes', async () => {
  const context = await browser.newContext();
  try {
    await context.route('http://profile.test/**', (route) => route.fulfill({ contentType: 'text/html', body:
      route.request().url().endsWith('/popup') ? `
        <label><input type="radio" id="credential" onchange="
          if (!window.changedOnce) {
            window.changedOnce = true;
            window.busy = true;
            setTimeout(() => { document.getElementById('credential').checked = false; window.busy = false; }, 900);
          }
        ">RADIATION THERAPIST RRT</label>
        <a href="#" onclick="
          if (document.getElementById('credential').checked) {
            opener.returnValue = 'X';
            opener.attachCredential();
            window.close();
          }
          return false;
        ">OK</a>
        <script>window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({ get_isInAsyncPostBack: () => Boolean(window.busy) }) } } };</script>
      ` : `
        <a href="/popup" target="_blank" rel="opener">License/Credential Type</a><div id="result">pending</div>
        <script>
          window.attachCredential = () => {
            window.busy = true;
            setTimeout(() => { document.getElementById('result').textContent = 'attached'; window.busy = false; }, 1100);
          };
          window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({ get_isInAsyncPostBack: () => Boolean(window.busy) }) } } };
        </script>
      ` }));
    const page = await context.newPage();
    await page.goto('http://profile.test/new');
    await runUiActions(page, [{ type: 'popupFromLink', name: 'License/Credential Type', attempts: 1,
      parentResult: { name: 'returnValue', value: 'X' },
      actions: [{ type: 'radio', name: 'RADIATION THERAPIST RRT', exact: true }, { type: 'clickLink', name: 'OK' }],
    }]);
    assert.equal(await page.locator('#result').innerText(), 'attached');
    assert.equal(context.pages().length, 1);
  } finally { await context.close(); }
});

test('persistent popup validation is surfaced without blindly reopening the rejected form', async () => {
  const context = await browser.newContext();
  let opened = 0;
  try {
    await context.route('http://profile.test/**', (route) => {
      const popup = route.request().url().endsWith('/popup');
      if (popup) opened += 1;
      return route.fulfill({ contentType: 'text/html', body: popup ? `
        <label><input type="radio">RADIATION THERAPIST RRT</label>
        <div id="ValidationSummary" hidden></div>
        <a href="#" onclick="document.getElementById('ValidationSummary').hidden=false; document.getElementById('ValidationSummary').textContent='Endorsement is required.'; return false;">OK</a>
      ` : '<a href="/popup" target="_blank">License/Credential Type</a>' });
    });
    const page = await context.newPage();
    await page.goto('http://profile.test/new');
    await assert.rejects(() => runUiActions(page, [{ type: 'popupFromLink', name: 'License/Credential Type',
      attempts: 3, closeTimeoutMs: 200,
      actions: [{ type: 'radio', name: 'RADIATION THERAPIST RRT' }, { type: 'clickLink', name: 'OK' }],
    }]), /was rejected: Endorsement is required/);
    assert.equal(opened, 1);
  } finally { await context.close(); }
});

test('a successful full parent postback acknowledges the popup even when globals are reset', async () => {
  const context = await browser.newContext();
  try {
    await context.route('http://profile.test/**', (route) => {
      const request = route.request();
      return route.fulfill({ contentType: 'text/html', body: request.url().endsWith('/popup') ? `
        <label><input type="radio">RADIATION THERAPIST RRT</label>
        <a href="#" onclick="opener.returnValue='X'; opener.document.querySelector('form').submit(); window.close(); return false;">OK</a>
      ` : request.method() === 'POST' ? '<div id="result">attached after reload</div>' : `
        <form method="post"></form><a href="/popup" target="_blank" rel="opener">License/Credential Type</a>
      ` });
    });
    const page = await context.newPage();
    await page.goto('http://profile.test/new');
    await runUiActions(page, [{ type: 'popupFromLink', name: 'License/Credential Type', attempts: 1,
      parentResult: { name: 'returnValue', value: 'X' },
      actions: [{ type: 'radio', name: 'RADIATION THERAPIST RRT' }, { type: 'clickLink', name: 'OK' }],
    }]);
    assert.equal(await page.locator('#result').innerText(), 'attached after reload');
    assert.equal(await page.evaluate(() => window.returnValue), undefined);
  } finally { await context.close(); }
});

test('an unfinished parent callback times out and releases its response listener', async () => {
  const context = await browser.newContext();
  try {
    await context.route('http://profile.test/**', (route) => route.fulfill({ contentType: 'text/html', body:
      route.request().url().endsWith('/popup') ? `
        <label><input type="radio">RADIATION THERAPIST RRT</label>
        <a href="#" onclick="opener.returnValue='X'; opener.busy=true; window.close(); return false;">OK</a>
      ` : `
        <a href="/popup" target="_blank" rel="opener">License/Credential Type</a>
        <script>window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({ get_isInAsyncPostBack: () => Boolean(window.busy) }) } } };</script>
      ` }));
    const page = await context.newPage();
    await page.goto('http://profile.test/new');
    const listeners = page.listenerCount('response');
    await assert.rejects(() => runUiActions(page, [{ type: 'popupFromLink', name: 'License/Credential Type',
      attempts: 1, parentPostbackTimeoutMs: 1500,
      actions: [{ type: 'radio', name: 'RADIATION THERAPIST RRT' }, { type: 'clickLink', name: 'OK' }],
    }]), /ASP.NET postback did not settle/);
    assert.equal(page.listenerCount('response'), listeners);
  } finally { await context.close(); }
});

test('an already-saved individual profile never triggers another Save', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<h1>Individual Profile has been saved successfully.</h1>');
    await saveCreatedProfile(page, { onSaveAttempt: () => assert.fail('already saved') });
  } finally { await page.close(); }
});

test('persistent create validation fails without submitting another Save', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<h1>New Individual</h1><p>Please provide License/Credential information details.</p><button>Save</button>');
    await assert.rejects(() => saveCreatedProfile(page, { onSaveAttempt: () => assert.fail('validation must not resubmit') }), /Validation error/);
  } finally { await page.close(); }
});

test('a delayed successful Save records a persistence checkpoint and submits once', async () => {
  const page = await browser.newPage();
  let checkpoints = 0;
  try {
    await page.setContent(`<h1>New Individual</h1><button onclick="
      window.saved = (window.saved || 0) + 1;
      setTimeout(() => { document.body.innerHTML='<h1>Individual has been saved successfully</h1>'; }, 1800);
    ">Save</button>`);
    await saveCreatedProfile(page, { onSaveAttempt: () => { checkpoints += 1; } });
    assert.equal(checkpoints, 1);
    assert.equal(await page.evaluate(() => window.saved), 1);
  } finally { await page.close(); }
});

test('an unknown Save result is not submitted twice', async () => {
  const page = await browser.newPage();
  const originalTimeout = baselineConfig.timeouts.navigationMs;
  baselineConfig.timeouts.navigationMs = 150;
  try {
    await page.setContent('<h1>New Individual</h1><button onclick="window.saved=(window.saved || 0)+1">Save</button>');
    await assert.rejects(() => saveCreatedProfile(page), /refusing to submit Save again/);
    assert.equal(await page.evaluate(() => window.saved), 1);
  } finally {
    baselineConfig.timeouts.navigationMs = originalTimeout;
    await page.close();
  }
});

test('duplicate API validation in the actual server-message container fails immediately', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<h1>New Individual</h1><div id="ctl00_pnlMessage">Provided API# already exists, API# must be unique.</div><button>Save</button>`);
    await assert.rejects(() => saveCreatedProfile(page, { onSaveAttempt: () => assert.fail('must not submit invalid data') }), /Validation error: Provided API# already exists/);
  } finally { await page.close(); }
});
