import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { RegistrationPage } from '../pages/RegistrationPage.js';
import { siteRegistry } from '../registry/siteRegistry.js';
import { editableData } from '../config/editableData.js';

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

test('Cranes HTTP errors stop before looking for the login or registration controls', async () => {
  const site = siteRegistry.resolve('CRANES', 'TEST');
  const strategy = siteRegistry.createStrategy(site, {
    page: { goto: async () => ({ status: () => 503 }) },
    registrationPage: { waitForLoginShell: async () => assert.fail('Must not search an HTTP error page') },
  });
  strategy.disableAutocomplete = async () => {};
  await assert.rejects(strategy.openRegistration(site.products[0], {}), /Cranes login URL returned HTTP 503.*version overrides/);
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

test('Cranes controls tolerate delayed rendering without changing the configured selections', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const site = siteRegistry.resolve('CRANES', 'TEST');
  const setup = async (child, html) => {
    const page = await browser.newPage();
    child.after(() => page.close());
    await page.setContent(html);
    const form = new RegistrationPage(page);
    return { page, strategy: siteRegistry.createStrategy(site, { page, registrationPage: form }) };
  };

  for (const replace of [false, true]) {
    await t.test(`selection waits for dependent roles after a ${replace ? 'DOM replacement' : 'late reset'}`, async (child) => {
      const { page, strategy } = await setup(child, `
        <div hidden><label>Business Unit<select><option value="CMS">Conveyance</option></select></label></div>
        <label>Business Unit *<select id="unit"><option value="">-- Choose One --</option><option value="CRN">Cranes</option></select></label>
        <label>Please select your role<select id="role" hidden disabled></select></label>
        <script>
          window.changes = 0;
          function bind(select) {
            select.addEventListener('change', () => {
              window.changes++;
              if (window.changes === 1) setTimeout(() => {
                if (${replace}) {
                  const replacement = select.cloneNode(true);
                  replacement.value = '';
                  select.replaceWith(replacement);
                  bind(replacement);
                } else select.value = '';
              }, 50);
              else setTimeout(() => {
                const role = document.getElementById('role');
                role.innerHTML = '<option value="CRNCNTR">Crane Contractor</option>';
                role.hidden = false;
                role.disabled = false;
              }, 50);
            });
          }
          bind(document.getElementById('unit'));
        </script>`);
      const role = strategy.selectLocator('Please select your role');
      assert.equal(await strategy.selectByLabel('Business Unit', 'CRN', {
        timeout: 300,
        ready: async () => await role.isVisible() && await role.isEnabled(),
      }), 'CRN');
      assert.equal(await page.evaluate(() => window.changes), 2);
      assert.equal(await page.locator('#unit').inputValue(), 'CRN');
      assert.equal(await role.isVisible(), true);
      assert.equal(await page.locator('div[hidden] select').inputValue(), 'CMS');
    });
  }

  await t.test('a delayed configured option cannot fall back to another business unit', async (child) => {
    const { page, strategy } = await setup(child, `
      <label>Business Unit<select id="unit"><option value="CMS">Conveyance</option></select></label>
      <script>setTimeout(() => document.getElementById('unit').add(new Option('Cranes', 'CRN')), 350);</script>`);
    assert.equal(await strategy.selectByLabel('Business Unit', 'CRN', { timeout: 1000 }), 'CRN');
    assert.equal(await page.locator('#unit').inputValue(), 'CRN');
  });

  await t.test('a permanently missing configured option fails clearly', async (child) => {
    const { page, strategy } = await setup(child, '<label>Business Unit<select><option value="CMS">Conveyance</option></select></label>');
    await assert.rejects(strategy.selectByLabel('Business Unit', 'CRN', { timeout: 100 }), /Cranes Business Unit.*"CRN".*Actual="CMS"/);
    assert.equal(await page.getByLabel('Business Unit').inputValue(), 'CMS');
  });

  await t.test('locked dropdowns retain server values and reject empty placeholders', async (child) => {
    const { page, strategy } = await setup(child, '<label>Country<select disabled><option value="CA" selected>Canada</option></select></label>');
    assert.equal(await strategy.selectByLabel('Country', 'US', { preserveLocked: true }), 'CA');
    assert.equal(await page.getByLabel('Country').inputValue(), 'CA');
    await page.setContent('<label>Country<select disabled><option value="">-- Choose One --</option></select></label>');
    await assert.rejects(strategy.selectByLabel('Country', 'US', { preserveLocked: true, timeout: 100 }), /Locked Cranes Country dropdown has no selected value/);
  });

  await t.test('a temporarily disabled empty dropdown waits for initialization', async (child) => {
    const { page, strategy } = await setup(child, `
      <label>Country<select id="country" disabled><option value="">-- Choose One --</option><option value="US">United States</option></select></label>
      <script>setTimeout(() => document.getElementById('country').disabled = false, 100);</script>`);
    assert.equal(await strategy.selectByLabel('Country', 'US', { preserveLocked: true, timeout: 1000 }), 'US');
    assert.equal(await page.locator('#country').inputValue(), 'US');
  });

  await t.test('optional absent or hidden fields are skipped; required fields still fail', async (child) => {
    const { page, strategy } = await setup(child, '<label>Fax<input hidden></label>');
    assert.equal(await strategy.fillText(page.getByLabel('Fax'), '111-222-3333', { required: false, timeout: 50 }), null);
    assert.equal(await strategy.fillText(page.locator('#not-present'), '', { required: false, timeout: 50 }), null);
    await assert.rejects(strategy.fillText(page.locator('#not-present'), 'required', { timeout: 50 }), /Timeout/);
  });

  await t.test('temporarily disabled required fields wait until editable', async (child) => {
    const { page, strategy } = await setup(child, `
      <label>Entity Name<input id="entity" disabled></label>
      <script>setTimeout(() => document.getElementById('entity').disabled = false, 100);</script>`);
    assert.equal(await strategy.fillText(page.getByLabel('Entity Name'), 'New Entity', { timeout: 1000 }), 'New Entity');
  });

  await t.test('asynchronously populated locked fields preserve the returned entity', async (child) => {
    const { page, strategy } = await setup(child, `
      <label>Entity Name<input id="entity" readonly></label>
      <script>setTimeout(() => document.getElementById('entity').value = 'Registered Entity', 100);</script>`);
    assert.equal(await strategy.fillText(page.getByLabel('Entity Name'), 'New Entity', { timeout: 1000 }), 'Registered Entity');
  });

  await t.test('visible text controls are filled without firing an empty change event', async (child) => {
    const { page, strategy } = await setup(child, `
      <input class="entity" hidden value="Hidden Entity">
      <input class="entity" id="entity" value="Previous Entity">
      <script>
        window.emptyChanges = 0;
        document.getElementById('entity').addEventListener('change', event => {
          if (!event.target.value) window.emptyChanges++;
        });
      </script>`);
    assert.equal(await strategy.fillText(page.locator('.entity'), 'New Entity'), 'New Entity');
    assert.equal(await page.locator('.entity').first().inputValue(), 'Hidden Entity');
    assert.equal(await page.evaluate(() => window.emptyChanges), 0);
  });

  await t.test('only the known inactivity dialog is dismissed before the preliminary dropdown is used', async (child) => {
    const { page, strategy } = await setup(child, `
      <button onclick="window.otherYesClicked = true">Yes</button>
      <div role="dialog"><h2>Alert</h2><p>Are you still there?</p>
        <button id="changed-session-action" onclick="this.parentElement.hidden = true; document.getElementById('unit').disabled = false">Yes</button>
      </div>
      <label>Business Unit<select id="unit" disabled><option value="CRN">Cranes</option></select></label>`);
    await strategy.waitForPreliminaryPage();
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.equal(await page.locator('#unit').isEnabled(), true);
    assert.equal(await page.evaluate(() => Boolean(window.otherYesClicked)), false);
  });

  await t.test('closing the page cannot be mistaken for an unavailable optional field', async (child) => {
    const { page, strategy } = await setup(child, '<input id="fax">');
    const field = page.locator('#fax');
    await page.close();
    await assert.rejects(strategy.fillText(field, '111-222-3333', { required: false }), /closed/);
  });

  await t.test('an inactivity dialog appearing during data entry is handled before filling', async (child) => {
    const { page, strategy } = await setup(child, `
      <div role="alertdialog"><p>Are you still there?</p>
        <button onclick="this.parentElement.hidden = true; document.getElementById('entity').disabled = false">Yes</button>
      </div>
      <label>Entity Name<input id="entity" disabled></label>`);
    assert.equal(await strategy.fillText(page.getByLabel('Entity Name'), 'New Entity', { timeout: 1000 }), 'New Entity');
    assert.equal(await page.getByRole('alertdialog').isVisible(), false);
  });

  await t.test('an inactivity dialog appearing before Submit is handled without forcing Register', async (child) => {
    const { page, strategy } = await setup(child, `
      <div role="alert"><p>Are you still there?</p>
        <button onclick="this.parentElement.hidden = true; document.getElementById('register').disabled = false">Yes</button>
      </div>
      <button id="register" disabled onclick="window.submitted = true">Register</button>`);
    await strategy.submit();
    assert.equal(await page.evaluate(() => window.submitted), true);
    assert.equal(await page.getByRole('alert').isVisible(), false);
  });

  await t.test('unrelated dialogs and hidden inactivity templates are never confirmed', async (child) => {
    const { page, strategy } = await setup(child, `
      <div role="dialog"><p>Delete this account?</p><button onclick="window.deleted = true">Yes</button></div>
      <div role="dialog" hidden><p>Are you still there?</p><button onclick="window.hiddenClicked = true">Yes</button></div>`);
    await strategy.dismissInactiveDialog();
    assert.equal(await page.evaluate(() => Boolean(window.deleted || window.hiddenClicked)), false);
  });

  await t.test('signup is scoped to its row despite changed IDs and another Click Here link', async (child) => {
    const { page, strategy } = await setup(child, `
      <table><tr><td><table>
        <tr><td>Conveyance Lookup Tool: <a href="http://cranes.example/Lookup">Click Here</a></td></tr>
        <tr><td>Sign Up for New User: <a id="new-signup-id" href="http://cranes.example/UserRegistrationPrelim">Click Here</a></td></tr>
      </table></td></tr></table>`);
    await page.route('http://cranes.example/**', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<label>Business Unit<select><option value="CRN">Cranes</option></select></label>',
    }));
    await strategy.openPreliminaryRegistration();
    assert.equal(page.url(), 'http://cranes.example/UserRegistrationPrelim');
  });

  await t.test('section discovery supports semantic headings, named regions, and fieldset legends', async (child) => {
    const { page, strategy } = await setup(child, '');
    for (const html of [
      '<section><h2>User Detail</h2><label>Last Name *<input></label></section>',
      '<div role="region" aria-label="User Detail"><label>Last Name<input></label></div>',
      '<fieldset><legend>User Detail</legend><label>Last Name<input></label></fieldset>',
    ]) {
      await page.setContent(html);
      const section = await strategy.registrationSection('User Detail');
      await strategy.fillText(strategy.textLocator(section, 'Last Name'), 'User Last Name');
      assert.equal(await page.getByRole('textbox').inputValue(), 'User Last Name');
    }
    await page.setContent('<section><h2>Other Section</h2></section>');
    await assert.rejects(strategy.registrationSection('User Detail', { timeout: 100 }), /Expected one visible Cranes "User Detail" section/);
    await page.setContent('<section><h2>User Detail</h2></section><section><h2>User Detail</h2></section>');
    await assert.rejects(strategy.registrationSection('User Detail', { timeout: 100 }), /Expected one visible Cranes "User Detail" section/);
  });

  await t.test('ambiguous visible text fields fail instead of silently filling the first one', async (child) => {
    const { page, strategy } = await setup(child, '<label>Email<input></label><label>Email<input></label>');
    await assert.rejects(strategy.fillText(page.getByRole('textbox', { name: 'Email', exact: true }), 'user@example.com'), /strict mode violation/);
    assert.deepEqual(await page.getByRole('textbox').evaluateAll(inputs => inputs.map(input => input.value)), ['', '']);
  });

  await t.test('business and user contacts remain separate with changed IDs and reordered extensions', async (child) => {
    const { page, strategy } = await setup(child, `
      <section><h2>User Detail</h2>
        <input id="new-user-last" aria-label="Last Name">
        <input id="new-user-first" aria-label="First Name">
        <input aria-label="Email" placeholder="E-mail">
        <input name="Extension" aria-label="Phone # - Ext" value="987">
        <input id="new-user-phone" aria-label="Phone # - Ext">
      </section>
      <section><h2>Entity Information</h2>
        <input aria-label="Entity Name"><input aria-label="UBI #">
        <input id="new-contact-first" aria-label="First Name">
        <input id="new-contact-last" aria-label="Last Name">
        <input aria-label="Email">
        <input name="Extension" aria-label="Phone" value="654">
        <input id="new-contact-phone" aria-label="Phone">
      </section>
      <section><h2>Entity Mailing Address</h2>
        <label>Country<select><option value="US">United States</option></select></label>
        <label>State/Province<select><option value="WA">Washington</option></select></label>
        <label>County<select><option value="KING">King</option></select></label>
        <input aria-label="Address"><input aria-label="Suite/Apt/Unit/etc."><input aria-label="City">
        <input aria-label="Zip"><input aria-label="Primary Phone #"><input aria-label="Fax">
        <input aria-label="Primary E-mail" placeholder="E-mail"><input aria-label="Alternate E-mail" placeholder="E-mail">
      </section>
      <section><h2>Attestation</h2><label><input type="checkbox">I have read and agree to the terms</label></section>
      <section><h2>Online Account Information</h2>
        <input aria-label="Name*"><input aria-label="Login Name*">
        <input aria-label="Password*"><input aria-label="Re-type Password *">
      </section>`);
    const product = site.products[0];
    const user = { ...strategy.buildUser(product), country: 'US', state: 'WA', firstName: 'AccountFirst', lastName: 'AccountLast' };
    await strategy.fillRegistration(product, user);
    const entity = await strategy.registrationSection('Entity Information');
    const details = await strategy.registrationSection('User Detail');
    assert.equal(await strategy.textLocator(details, 'First Name').inputValue(), '');
    assert.equal(await strategy.textLocator(details, 'Email').inputValue(), '');
    await strategy.fillAccount(user);
    assert.equal(await strategy.textLocator(entity, 'First Name').inputValue(), editableData.businessContactFirstName);
    assert.equal(await strategy.textLocator(entity, 'Last Name').inputValue(), editableData.businessContactLastName);
    assert.equal(await strategy.textLocator(entity, 'Email').inputValue(), user.email);
    assert.equal(await strategy.phoneLocator(entity, 'Phone').inputValue(), user.businessPhone);
    assert.equal(await strategy.textLocator(details, 'First Name').inputValue(), user.firstName);
    assert.equal(await strategy.textLocator(details, 'Last Name').inputValue(), user.lastName);
    assert.equal(await strategy.textLocator(details, 'Email').inputValue(), user.email);
    assert.equal(await strategy.phoneLocator(details, 'Phone # - Ext').inputValue(), user.userPhone);
    assert.equal(await entity.locator('input[name="Extension"]').inputValue(), '654');
    assert.equal(await details.locator('input[name="Extension"]').inputValue(), '987');
    assert.equal(await page.getByRole('textbox', { name: 'Primary E-mail', exact: true }).inputValue(), user.email);
  });
});
