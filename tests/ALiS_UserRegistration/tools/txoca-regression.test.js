import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { RegistrationPage } from '../pages/RegistrationPage.js';
import { TxocaStrategy } from '../strategies/TxocaStrategy.js';
import { sites } from '../config/sites.js';

// Mocks, about:blank HTML and a loopback HTTP fixture only; no live registrations.
const identity = { firstName: 'Test', lastName: 'Person', dob: '01/31/1980', date: '01/31/1980' };
const mismatch = 'Information provided by you does not match with our record, review your personal information';
const site = { ...sites.TXOCA, environment: { key: 'TEST', name: 'Testing' } };

function harness(page = {}, form = {}) {
  const attachments = [];
  const strategy = new TxocaStrategy({
    site, page, registrationPage: form,
    testInfo: { attach: async (name, attachment) => attachments.push({ name, ...attachment }) },
  });
  return { strategy, attachments };
}

for (const productKey of ['GRD', 'CR', 'PS', 'CI', 'PROFESSIONAL_CG']) {
  test(`${productKey}: server mismatch stops after one submit and preserves evidence`, async () => {
    let submissions = 0;
    const { strategy, attachments } = harness({}, {
      fillAccount: async () => {},
      isDuplicateLoginVisible: async () => false,
      duplicateProfileText: async () => '',
      validationText: async () => mismatch,
    });
    const user = { ...identity, loginName: 'isolated_test' };
    const original = { ...user };
    const diagnostics = { product: productKey, submission: { observed: true, status: 200 } };
    strategy.registrationDiagnostics = diagnostics;
    strategy.submit = async () => { submissions += 1; };
    strategy.refreshUser = () => assert.fail('Mismatch must not generate another identity');
    strategy.fillRegistration = async () => assert.fail('Mismatch must not refill the form');
    await assert.rejects(strategy.submitWithRetries(strategy.product(productKey), user), { code: 'TXOCA_PROFILE_MISMATCH' });
    assert.equal(submissions, 1);
    assert.deepEqual(user, original);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].name, 'txoca-registration-diagnostics');
    assert.equal(attachments[0].contentType, 'application/json');
    assert.deepEqual(JSON.parse(attachments[0].body.toString()), diagnostics);
  });
}

test('duplicate login still retries the account without changing identity', async () => {
  let submissions = 0;
  const { strategy } = harness({}, {
    fillAccount: async () => {},
    isDuplicateLoginVisible: async () => submissions === 1,
    duplicateProfileText: async () => '',
    validationText: async () => '',
  });
  strategy.submit = async () => { submissions += 1; };
  strategy.isSuccessful = async () => submissions === 2;
  strategy.nextLoginName = () => 'unused_login';
  const user = { ...identity, loginName: 'taken_login' };
  assert.equal(await strategy.submitWithRetries(strategy.product('CR'), user), user);
  assert.equal(submissions, 2);
  assert.equal(user.loginName, 'unused_login');
  for (const [key, value] of Object.entries(identity)) assert.equal(user[key], value);
});

test('other duplicate-profile responses retain the existing retry behavior', async () => {
  let refreshed = false;
  let refilled = false;
  const { strategy } = harness({}, { waitForReady: async () => {} });
  strategy.refreshUser = () => { refreshed = true; };
  strategy.fillRegistration = async () => { refilled = true; };
  await strategy.retryWithFreshProfile(strategy.product('CR'), { ...identity }, 'Profile with this data already exists.');
  assert.equal(refreshed, true);
  assert.equal(refilled, true);
});

test('welcome text cannot mark an open registration form successful', async () => {
  let formOpen = true;
  const { strategy } = harness({ url: () => 'http://txoca.invalid/InitialUserRegistration.aspx' }, {
    isRegistrationFormOpen: async () => formOpen,
    bodyText: async () => 'Welcome to registration',
  });
  assert.equal(await strategy.isSuccessful(), false);
  formOpen = false;
  assert.equal(await strategy.isSuccessful(), true);
});

for (const formOpen of [false, true]) {
  test(`${formOpen ? 'open form' : 'unknown response page'} cannot silently pass or trigger a fresh identity`, async () => {
    let submissions = 0;
    const { strategy, attachments } = harness({ url: () => 'http://txoca.invalid/Unexpected.aspx' }, {
      fillAccount: async () => {},
      isDuplicateLoginVisible: async () => false,
      duplicateProfileText: async () => '',
      validationText: async () => '',
      isRegistrationFormOpen: async () => formOpen,
      bodyText: async () => '',
    });
    strategy.submit = async () => { submissions += 1; };
    strategy.refreshUser = () => assert.fail('Unconfirmed outcomes must not change identity');
    strategy.fillRegistration = async () => assert.fail('Unconfirmed outcomes must not refill');
    strategy.registrationDiagnostics = { submission: { observed: true, status: 200 } };
    const user = { ...identity, loginName: 'isolated_test' };
    const original = { ...user };
    await assert.rejects(strategy.submitWithRetries(strategy.product('CR'), user), { code: 'TXOCA_UNCONFIRMED_OUTCOME' });
    assert.equal(submissions, 1);
    assert.deepEqual(user, original);
    assert.equal(attachments[0].name, 'txoca-registration-diagnostics');
  });
}

test('local browser contracts for links and identity fields', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.abort());
  const form = new RegistrationPage(page);
  form.waitForReady = async () => {};
  const { strategy, attachments } = harness(page, form);
  const product = { key: 'CR', registrationRowText: 'To apply for New Certification', registrationLinkId: 'legacy-id' };

  await t.test('hidden duplicate rows and changed IDs resolve the visible intended link', async () => {
    await page.setContent(`<table>
      <tr hidden><td>To apply for New Certification</td><td><a id="legacy-id" href="#">Click Here</a></td></tr>
      <tr><td>To apply for New Certification:</td><td><a id="new-id" href="#">Click Here</a></td></tr>
      <tr><td>To apply for New Certification as a Firm</td><td><a id="firm-id" href="#">Click Here</a></td></tr>
      </table>`);
    assert.equal(await (await strategy.registrationLink(product)).getAttribute('id'), 'new-id');
  });

  await t.test('two visible matching rows fail instead of selecting an arbitrary program', async () => {
    await page.setContent(`<table>
      <tr><td>To apply for New Certification</td><td><a href="#">Click Here</a></td></tr>
      <tr><td>To apply for New Certification</td><td><a href="#">Click Here</a></td></tr>
      </table>`);
    await assert.rejects(strategy.registrationLink(product), { code: 'TXOCA_REGISTRATION_LINK' });
  });

  await t.test('a reused ID pointing to another row cannot silently change the flow', async () => {
    await page.setContent('<table><tr><td>Existing user registration</td><td><a id="legacy-id" href="#">Click Here</a></td></tr></table>');
    await assert.rejects(strategy.registrationLink(product), { code: 'TXOCA_REGISTRATION_LINK' });
  });

  await t.test('products without a configured row retain the usable ID fallback', async () => {
    await page.setContent('<a id="legacy-id" href="#">Click Here</a>');
    assert.equal(await (await strategy.registrationLink({ key: 'CF', registrationLinkId: 'legacy-id' })).getAttribute('id'), 'legacy-id');
  });

  const fields = `<label>First Name *<input name="firstName"></label>
    <label>Last Name *<input name="lastName"></label>
    <label>DOB *<input name="dob"></label>`;
  await t.test('identity round-trips exactly and diagnostics omit personal values', async () => {
    await page.setContent(fields);
    await strategy.fillIdentity(identity);
    for (const key of ['firstName', 'lastName', 'dob']) assert.equal(strategy.registrationDiagnostics.identity[key].matchesExpected, true);
    const serialized = JSON.stringify(strategy.registrationDiagnostics);
    for (const value of ['Test', 'Person', '01/31/1980']) assert.equal(serialized.includes(value), false);
  });

  await t.test('missing or duplicate DOB fails before submission', async () => {
    await page.setContent(fields.replace('<label>DOB *<input name="dob"></label>', ''));
    await assert.rejects(strategy.fillIdentity(identity), { code: 'TXOCA_IDENTITY_FIELD' });
    await page.setContent(`${fields}<label>DOB *<input name="second-dob"></label>`);
    await assert.rejects(strategy.fillIdentity(identity), { code: 'TXOCA_IDENTITY_FIELD' });
  });

  await t.test('readonly DOB cannot be treated as successfully filled', async () => {
    await page.setContent(fields.replace('name="dob"', 'name="dob" readonly'));
    await assert.rejects(strategy.fillIdentity(identity));
  });

  await t.test('postback value drift is diagnosed before Register can be clicked', async () => {
    await page.setContent(fields);
    await strategy.fillIdentity(identity);
    await page.locator('[name="dob"]').fill('02/01/1980');
    await assert.rejects(strategy.verifyIdentity(identity), { code: 'TXOCA_IDENTITY_VALUE' });
    assert.equal(strategy.registrationDiagnostics.identity.dob.matchesExpected, false);
    assert.equal(attachments.at(-1).name, 'txoca-registration-diagnostics');
  });

  await t.test('actual Register postback carries identity and accepts a 302 dashboard redirect', async () => {
    const routedPage = await browser.newPage();
    const submissions = [];
    const server = createServer(async (request, response) => {
      if (request.url === '/Dashboard.aspx') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<h1>Welcome to Dashboard</h1>');
        return;
      }
      if (request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        submissions.push(new URLSearchParams(body));
        response.writeHead(302, { Location: '/Dashboard.aspx' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html>
        <form method="post" action="/InitialUserRegistration.aspx">
          <input type="hidden" name="__EVENTTARGET">${fields}
          <a href="javascript:__doPostBack('form$Register','')">Register</a>
        </form>
        <script>function __doPostBack(target) {
          document.forms[0].elements.__EVENTTARGET.value = target;
          document.forms[0].submit();
        }</script>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await routedPage.goto(`http://127.0.0.1:${server.address().port}/InitialUserRegistration.aspx`);
      const { strategy: routedStrategy } = harness(routedPage, new RegistrationPage(routedPage));
      routedStrategy.requiresIdentity = true;
      await routedStrategy.fillIdentity(identity);
      await routedStrategy.submit(routedStrategy.product('CR'), identity);
      assert.equal(submissions.length, 1);
      assert.equal(submissions[0].get('__EVENTTARGET'), 'form$Register');
      for (const key of ['firstName', 'lastName', 'dob']) assert.equal(submissions[0].get(key), identity[key]);
      assert.match(routedPage.url(), /\/Dashboard\.aspx$/);
      assert.equal(routedStrategy.registrationDiagnostics.submission.status, 302);
      for (const value of Object.values(routedStrategy.registrationDiagnostics.submission.identity)) {
        assert.equal(value.matchesExpected, true);
      }
      assert.equal(await routedStrategy.isSuccessful(), true);
    } finally {
      await routedPage.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

function submissionHarness(status = 200, body = '__EVENTTARGET=form%24Register') {
  const page = new EventEmitter();
  page.url = () => 'http://txoca.invalid/InitialUserRegistration.aspx';
  const register = { evaluate: async () => ({ target: 'form$Register', name: '' }) };
  const locator = { or() { return this; } };
  page.getByRole = () => locator;
  const request = { method: () => 'POST', url: page.url, postData: () => body };
  let responsePredicate;
  let deliver;
  page.waitForResponse = (predicate) => {
    responsePredicate = predicate;
    return new Promise((resolve) => { deliver = () => resolve({ request: () => request, status: () => status, finished: async () => null }); });
  };
  const form = {
    firstUsable: async () => register,
    waitForReady: async () => {},
    click: async () => { page.emit('request', request); },
    validationText: async () => '',
  };
  return { ...harness(page, form), page, request, deliver: () => deliver(), predicate: () => responsePredicate };
}

test('submit waits for its own delayed POST response and removes its listener', async () => {
  const { strategy, page, deliver, predicate } = submissionHarness();
  let completed = false;
  const pending = strategy.submit(strategy.product('CR'), {}).then(() => { completed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(predicate()({ request: () => ({ method: () => 'POST', url: page.url, postData: () => '__EVENTTARGET=form%24State' }) }), false);
  deliver();
  await pending;
  assert.equal(strategy.registrationDiagnostics.submission.status, 200);
  assert.equal(page.listenerCount('request'), 0);
});

test('HTTP 500 on Register fails with evidence instead of triggering identity retries', async () => {
  const { strategy, page, attachments, deliver } = submissionHarness(500);
  const pending = strategy.submit(strategy.product('CR'), {});
  const assertion = assert.rejects(pending, { code: 'TXOCA_SUBMIT_RESPONSE' });
  await new Promise((resolve) => setImmediate(resolve));
  deliver();
  await assertion;
  assert.equal(attachments.length, 1);
  assert.equal(JSON.parse(attachments[0].body.toString()).submission.status, 500);
  assert.equal(page.listenerCount('request'), 0);
});

test('a successful HTTP response cannot hide identity changed in the actual POST', async () => {
  const { strategy, page, attachments, deliver } = submissionHarness(200, '__EVENTTARGET=form%24Register&dob=changed');
  strategy.requiresIdentity = true;
  strategy.verifyIdentity = async () => [{ key: 'dob', name: 'dob', value: identity.dob }];
  const assertion = assert.rejects(strategy.submit(strategy.product('CR'), identity), { code: 'TXOCA_IDENTITY_POST' });
  await new Promise((resolve) => setImmediate(resolve));
  deliver();
  await assertion;
  const diagnostics = JSON.parse(attachments[0].body.toString());
  assert.deepEqual(diagnostics.submission.identity.dob, { name: 'dob', matchesExpected: false });
  assert.equal(attachments[0].body.toString().includes(identity.dob), false);
  assert.equal(page.listenerCount('request'), 0);
});
