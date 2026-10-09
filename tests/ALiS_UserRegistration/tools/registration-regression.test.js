import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { RegistrationPage } from '../pages/RegistrationPage.js';
import { siteRegistry } from '../registry/siteRegistry.js';

test('TXFSC generates valid random adult DOBs initially and on profile retry', () => {
  const site = siteRegistry.resolve('TXFSC', 'TEST');
  const strategy = siteRegistry.createStrategy(site, {});
  const product = site.products[0];
  const user = strategy.buildUser(product);
  for (let sample = 0; sample < 100; sample += 1) {
    assert.match(user.dob, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(user.date, user.dob);
    const [month, day, year] = user.dob.split('/').map(Number);
    const birth = new Date(year, month - 1, day);
    assert.equal(birth.getFullYear(), year);
    assert.equal(birth.getMonth() + 1, month);
    assert.equal(birth.getDate(), day);
    const now = new Date();
    const birthdayPending = now.getMonth() < birth.getMonth()
      || (now.getMonth() === birth.getMonth() && now.getDate() < day);
    const age = now.getFullYear() - year - Number(birthdayPending);
    assert.ok(age >= 21 && age <= 70, `DOB ${user.dob} has age ${age}`);
    strategy.refreshUser(product, user);
  }
});

test('Conveyance HTTP errors stop before looking for registration links', async () => {
  const site = siteRegistry.resolve('CONV', 'PROD');
  const strategy = siteRegistry.createStrategy(site, {
    page: { goto: async () => ({ status: () => 404 }) },
  });
  strategy.disableAutocomplete = async () => {};
  strategy.openPreliminaryRegistration = async () => assert.fail('Must not search a 404 page');
  await assert.rejects(strategy.openRegistration(site.products[0], {}), /HTTP 404.*config\/urls\.js/);
});

test('local browser preserves locked Cranes fields and fills editable fields', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.abort());
  const form = new RegistrationPage(page);
  const strategy = siteRegistry.createStrategy(siteRegistry.resolve('CRANES', 'TEST'), {
    page, registrationPage: form,
  });

  for (const lock of ['disabled', 'readonly']) {
    await page.setContent(`<label>Entity Name<input ${lock} value="Registered Entity"></label>`);
    const field = page.getByRole('textbox', { name: 'Entity Name' });
    assert.equal(await strategy.fillText(field, 'New Entity'), 'Registered Entity');
    assert.equal(await field.isEditable(), false);
  }
  await page.setContent('<label>Entity Name<input disabled></label>');
  const empty = page.getByRole('textbox', { name: 'Entity Name' });
  await assert.rejects(strategy.fillText(empty, 'New Entity'), /Locked Cranes.*has no value/);
  assert.equal(await strategy.fillText(empty, '', { required: false }), '');

  await page.setContent('<label>Entity Name<input value="Old Entity"></label>');
  assert.equal(await strategy.fillText(page.getByRole('textbox', { name: 'Entity Name' }), 'New Entity'), 'New Entity');
});

test('Cranes accepts explicit approval-pending confirmation without treating the account as approved', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const approval = 'There may be processing time while your company administrator reviews your request for access. Once your registration is complete, you will receive an email notification.';
  let body = '';
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body }));
  const testInfo = { annotations: [] };
  const strategy = siteRegistry.createStrategy(siteRegistry.resolve('CRANES', 'TEST'), {
    page, registrationPage: new RegistrationPage(page), testInfo,
  });
  for (const message of ['You have successfully registered.', 'User has been registered successfully.']) {
    body = `<p>${message}</p>`;
    await page.goto('http://cranes.example/SuccessPage.aspx');
    assert.equal(await strategy.isSuccessful(), true);
  }
  body = `<p>${approval}</p><button>Return to Login</button>`;
  await page.goto('http://cranes.example/ALiSWADLNI3TESTING11.4.42.01/SuccessPage');
  assert.equal(await strategy.isSuccessful(), true);
  assert.equal(await strategy.isSuccessful(), true);
  assert.deepEqual(testInfo.annotations, [{
    type: 'Registration Outcome', description: 'Submitted - pending company administrator approval',
  }]);
  await page.goto('http://cranes.example/InitialUserRegistration.aspx');
  assert.equal(await strategy.isSuccessful(), false, 'Approval text outside a confirmation page must not pass');
  body = `<p>${approval}</p><button hidden>Return to Login</button>`;
  await page.goto('http://cranes.example/SuccessPage');
  assert.equal(await strategy.isSuccessful(), false, 'The confirmation must have a visible return action');
  body = `<p>${approval}</p><label>Login Name *<input></label><button>Register</button><button>Return to Login</button>`;
  await page.goto('http://cranes.example/SuccessPage');
  assert.equal(await strategy.isSuccessful(), false, 'An open registration form must not pass');
  assert.equal(await strategy.shouldRetryWhenFormStillOpen(), true);
  body = `<p>${approval}</p><button>Return to Login</button>`;
  await page.goto('http://cranes.example/UnknownResponse');
  await assert.rejects(strategy.shouldRetryWhenFormStillOpen(), /did not reach a confirmed success/);
});
