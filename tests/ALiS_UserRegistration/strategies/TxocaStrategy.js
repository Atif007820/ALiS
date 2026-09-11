import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { logger } from '../utils/logger.js';
import {
  adultDateOfBirth,
  city,
  entityName,
  numberWithDigitLength,
  phone,
  simplePerson,
  ssn,
  street,
  unit,
  zip,
} from '../utils/randomData.js';

export class TxocaStrategy extends BaseStrategy {
  buildUser(product) {
    const user = super.buildUser(product);
    const dob = adultDateOfBirth();
    user.date = dob;
    user.dob = dob;
    return user;
  }

  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();
    await this.selectStartupProgram(product);
    await this.selectProductTab(product);
    await this.clickRegistrationLink(product);
    await expect(this.page.locator('body')).toContainText(
      /Initial User Registration|Registration|Online Account|Login Name/i,
      { timeout: 30000 },
    );
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({ timeout: 30000 });

    if (product.registrationHeading) {
      await expect(this.page.getByRole('heading', {
        name: product.registrationHeading,
        exact: true,
      })).toBeVisible({ timeout: 30000 });
    }
  }

  async selectProductTab(product) {
    if (product.tabSelector) {
      const tabBySelector = this.page.locator(product.tabSelector).first();
      if (await tabBySelector.isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.form.click(tabBySelector);
        return;
      }
    }

    if (product.tabClickText) {
      await this.form.click(this.page.getByText(product.tabClickText, { exact: true }).first());
      return;
    }

    const tab = this.page.locator('.ajax__tab_tab').filter({ hasText: new RegExp(`^${escapeRegex(product.tabText)}$`, 'i') }).first();

    await this.form.click(tab);
  }

  async registrationLink(product) {
    if (product.registrationRowText) {
      const candidates = this.rowRegistrationLink(product.registrationRowText);
      const matches = [];
      for (let index = 0; index < await candidates.count(); index += 1) {
        const candidate = candidates.nth(index);
        if (await this.form.firstUsable(candidate)
          && await this.matchesRegistrationRow(candidate, product.registrationRowText)) matches.push(candidate);
      }
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        throw txocaError('TXOCA_REGISTRATION_LINK', `Ambiguous visible registration links for ${product.key}: ${product.registrationRowText}`);
      }
    }

    const byId = product.registrationLinkId
      ? await this.form.firstUsable(this.page.locator(`[id=${JSON.stringify(product.registrationLinkId)}]`))
      : null;
    if (byId) {
      if (product.registrationRowText && !(await this.matchesRegistrationRow(byId, product.registrationRowText))) {
        throw txocaError('TXOCA_REGISTRATION_LINK', `Registration ID ${product.registrationLinkId} points to a different row for ${product.key}; expected "${product.registrationRowText}".`);
      }
      return byId;
    }
    throw txocaError('TXOCA_REGISTRATION_LINK', `No visible registration link for ${product.key}; expected row "${product.registrationRowText || product.name}" (ID fallback: ${product.registrationLinkId || 'none'}).`);
  }

  rowRegistrationLink(rowText) {
    return this.page
      .locator(`xpath=//a[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'click here') and contains(translate(normalize-space(ancestor::tr[1]), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), ${xpathLiteral(String(rowText).toLowerCase())})]`);
  }

  async matchesRegistrationRow(link, expected) {
    const rowText = await link.evaluate((anchor) => {
      const row = anchor.closest('tr')?.cloneNode(true);
      if (!row) return '';
      row.querySelectorAll('a').forEach((element) => element.remove());
      return row.textContent || '';
    });
    return normalizeRow(rowText) === normalizeRow(expected);
  }

  async clickRegistrationLink(product) {
    const link = await this.registrationLink(product);
    const selectedLink = await link.evaluate((anchor) => ({
      id: anchor.id || '',
      text: String(anchor.textContent || '').replace(/\s+/g, ' ').trim(),
      rowText: String(anchor.closest('tr')?.textContent || '').replace(/\s+/g, ' ').trim(),
    })).catch(() => ({ id: '', text: '', rowText: '' }));
    logger.info(
      `Registration link resolved: ${selectedLink.id || '(no id)'} | ${selectedLink.rowText || selectedLink.text || '(no text)'}`,
    );
    this.registrationDiagnostics = {
      environment: this.site.environment.key,
      product: product.key,
      expectedHeading: product.registrationHeading || null,
      selectedLink,
    };
    const postBackTarget = await link.evaluate((anchor) => {
      const href = anchor.getAttribute('href') || '';
      return href.match(/__doPostBack\('([^']+)'/)?.[1]
        || href.match(/WebForm_PostBackOptions\("([^"]+)"/)?.[1]
        || '';
    }).catch(() => '');

    if (postBackTarget) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      const registrationUrl = this.page.waitForURL(/(?:InitialUserRegistration|Registration)\.aspx/i, { timeout: 30000 });
      // Observe the navigation failure immediately even if the action itself fails.
      registrationUrl.catch(() => {});
      await this.page.evaluate((target) => {
        if (typeof window.__doPostBack === 'function') {
          window.__doPostBack(target, '');
          return;
        }

        document.querySelector(`a[href*="${CSS.escape(target)}"]`)?.click();
      }, postBackTarget);
      await registrationUrl;
      await this.form.waitForReady();
      return;
    }

    await this.form.click(link);
  }

  async selectStartupProgram(product) {
    const modal = this.page.locator('#myModal').first();
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
    if (!modalVisible) return;

    await this.form.selectOption(modal.getByRole('combobox', { name: /Please choose the Program|Program/i }), programForProduct(product));
    const ok = modal.getByRole('link', { name: /^OK$/i }).or(modal.getByRole('button', { name: /^OK$/i })).first();
    await ok.click({ force: true, noWaitAfter: true, timeout: 10000 }).catch(async () => {
      await this.page.evaluate(() => {
        if (typeof window.__doPostBack === 'function') {
          window.__doPostBack('btnOk', '');
          return;
        }

        document.querySelector('#btnOk')?.click();
      });
    });
    await modal.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.form.waitForReady();
  }

  async fillRegistration(product, user) {
    if (await this.isSuccessful(product, user) && !(await this.form.isRegistrationFormOpen())) return;

    const firstNameFields = ['First Name', 'Given Name'];
    const programFields = ['Program Name', 'Entity Name', 'Business Name', 'Company Name', 'Organization Name', 'Firm Name', 'Legal Name'];
    const hasFirstName = await this.hasTextField(firstNameFields);
    const hasProgramName = await this.hasTextField(programFields);
    this.requiresIdentity = hasFirstName;

    if (hasFirstName) {
      await this.form.fillFirstText(programFields, user.entityName, { hard: true });
    } else if (hasProgramName) {
      await this.form.fillFirstText(programFields, user.entityName, { hard: true, required: true });
    } else {
      throw new Error(`TXOCA registration form did not expose first/given name or program name fields for ${product.key}.`);
    }

    await this.form.fillFirstText(['Email ID', 'Email', 'E-mail', 'Primary E-mail'], user.email, { hard: true, required: true });
    await this.form.fillFirstText(['Alt Email', 'Alternate E-mail', 'Alternate Email'], user.altEmail);
    await this.form.fillFirstText(['Address', 'Street One', 'Street 1', 'Address Line 1'], user.streetOne, { hard: true, required: true });
    await this.form.fillFirstText(['Street Two', 'Street 2', 'Address Line 2', 'Suite/Apt/Unit/etc.'], user.streetTwo, { hard: true });
    await this.form.fillFirstText(['City'], user.city, { hard: true, required: true });
    await this.form.selectFirst(['State', 'State/Province'], 'TX', { required: true });

    const zipFilled = await this.form.fillFirstText(['Zip', 'Zip Code', 'Postal Code'], user.zip, { hard: true, required: true });
    if (zipFilled) {
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.form.waitForReady();
    }

    await this.form.selectRandomCounty({ required: true });
    if (!(await this.form.fillPrimaryPhone(user))) {
      throw new Error('Required primary phone field was not available.');
    }
    await this.form.fillFirstText(['Fax'], user.fax);
    // State/ZIP can replace the form through postbacks. Fill identity last, and
    // require DOB to round-trip; the generic popup fallback is not TXOCA's calendar.
    if (hasFirstName) await this.fillIdentity(user);
  }

  async identityFields(user) {
    const fields = [];
    for (const [key, pattern, value] of [
      ['firstName', /^(First Name|Given Name)\s*\*?$/i, user.firstName],
      ['lastName', /^(Last Name|Surname)\s*\*?$/i, user.lastName],
      ['dob', /^(DOB|Date of Birth|Birth Date)\s*\*?$/i, user.dob || user.date],
    ]) {
      const candidates = this.page.getByRole('textbox', { name: pattern }).or(this.page.getByLabel(pattern));
      const visible = [];
      for (let index = 0; index < await candidates.count(); index += 1) {
        if (await candidates.nth(index).isVisible()) visible.push(candidates.nth(index));
      }
      if (visible.length !== 1 || !value) {
        throw txocaError('TXOCA_IDENTITY_FIELD', `Required TXOCA ${key} field/value is missing or ambiguous (${visible.length} visible fields).`);
      }
      const locator = visible[0];
      await expect(locator).toBeEditable({ timeout: 5000 });
      fields.push({ key, locator, value: String(value), name: await locator.getAttribute('name') });
    }
    return fields;
  }

  async fillIdentity(user) {
    for (const { locator, value } of await this.identityFields(user)) {
      await locator.fill(value);
      await locator.blur();
    }
    await this.form.waitForReady();
    await this.verifyIdentity(user);
  }

  async verifyIdentity(user) {
    const fields = await this.identityFields(user);
    const identity = {};
    for (const { key, locator, value, name } of fields) {
      // Never include actual identity values (or credentials) in diagnostics.
      identity[key] = { name, matchesExpected: await locator.inputValue() === value };
    }
    this.registrationDiagnostics = { ...this.registrationDiagnostics, identity };
    if (Object.values(identity).some((field) => !field.matchesExpected || !field.name)) {
      await this.attachDiagnostics();
      throw txocaError('TXOCA_IDENTITY_VALUE', 'TXOCA identity values did not survive form updates; registration was not submitted. See txoca-registration-diagnostics.');
    }
    return fields;
  }

  async submit(product, user) {
    await this.form.waitForReady();
    const fields = this.requiresIdentity ? await this.verifyIdentity(user) : [];
    const destination = new URL(this.page.url());
    const path = destination.pathname;
    const register = await this.form.firstUsable(this.page.getByRole('link', { name: /^Register$/i })
      .or(this.page.getByRole('button', { name: /^Register$/i })));
    if (!register) throw txocaError('TXOCA_SUBMIT_CONTROL', 'No visible TXOCA Register control.');
    const control = await register.evaluate((element) => ({
      target: (element.getAttribute('href') || '').match(/(?:__doPostBack|WebForm_PostBackOptions)\(['"]([^'"]+)/)?.[1],
      name: element.name || '',
    }));
    const isSubmission = (request) => {
      const requestUrl = new URL(request.url());
      if (request.method() !== 'POST' || requestUrl.origin !== destination.origin || requestUrl.pathname !== path) return false;
      const data = new URLSearchParams(request.postData() || '');
      return control.target ? data.get('__EVENTTARGET') === control.target : Boolean(control.name && data.has(control.name));
    };
    if (!control.target && !control.name) {
      throw txocaError('TXOCA_SUBMIT_CONTROL', 'TXOCA Register control has no identifiable postback target; update the submission contract.');
    }
    this.registrationDiagnostics = { ...this.registrationDiagnostics, path, submission: { observed: false } };
    const recordRequest = (request) => {
      if (!isSubmission(request)) return;
      const data = new URLSearchParams(request.postData() || '');
      this.registrationDiagnostics.submission = {
        observed: true,
        eventTarget: data.get('__EVENTTARGET'),
        identity: Object.fromEntries(fields.map(({ key, name, value }) => [key, { name, matchesExpected: data.get(name) === value }])),
      };
    };
    this.page.on('request', recordRequest);
    const pendingResponse = this.page.waitForResponse((response) => isSubmission(response.request()), { timeout: 30000 })
      .then((response) => ({ response }), (error) => ({ error }));
    try {
      await this.form.click(register);
      const { response } = await pendingResponse;
      if (!response) {
        // Client-side validators/dialogs may correctly prevent a POST. Let the
        // existing retry/validation logic handle them, not a random-profile retry.
        if (this.dialogMessages.length || await this.form.validationText()) return;
        await this.attachDiagnostics();
        throw txocaError('TXOCA_SUBMIT_TIMEOUT', 'No TXOCA registration response within 30 seconds. See txoca-registration-diagnostics.');
      }
      this.registrationDiagnostics.submission.status = response.status();
      const networkError = await response.finished();
      await this.form.waitForReady();
      if (networkError || response.status() >= 400) {
        await this.attachDiagnostics();
        throw txocaError('TXOCA_SUBMIT_RESPONSE', `TXOCA registration response failed (HTTP ${response.status()}). See txoca-registration-diagnostics.`);
      }
      if (Object.values(this.registrationDiagnostics.submission.identity || {}).some((field) => !field.matchesExpected)) {
        await this.attachDiagnostics();
        throw txocaError('TXOCA_IDENTITY_POST', 'TXOCA submitted identity differed from the verified form. See txoca-registration-diagnostics.');
      }
    } finally {
      this.page.off('request', recordRequest);
    }
  }

  async attachDiagnostics() {
    if (this.testInfo?.attach) {
      await this.testInfo.attach('txoca-registration-diagnostics', {
        body: Buffer.from(JSON.stringify(this.registrationDiagnostics || {}, null, 2)),
        contentType: 'application/json',
      });
    }
  }

  async hasTextField(names, timeout = 2000) {
    const deadline = Date.now() + timeout;

    while (Date.now() <= deadline) {
      for (const name of names) {
        const pattern = name instanceof RegExp ? name : new RegExp(`^${escapeRegex(name)}\\s*\\*?$`, 'i');
        const locators = [
          this.page.getByRole('textbox', { name: pattern }),
          this.page.getByLabel(pattern),
        ];

        for (const locator of locators) {
          if (await this.form.firstUsable(locator)) return true;
        }
      }

      await this.page.waitForTimeout(200);
    }

    return false;
  }

  refreshUser(product, user) {
    const person = simplePerson();
    const nextCity = city();
    user.firstName = person.firstName;
    user.lastName = person.lastName;
    user.fullName = `${person.firstName} ${person.lastName}`;
    user.contactPerson = user.fullName;
    user.entityName = entityName(product.entityPrefix || product.key);
    user.facilityName = user.entityName;
    user.streetOne = street(nextCity);
    user.streetTwo = unit();
    user.city = nextCity;
    user.zip = zip();
    user.phone = phone();
    user.phoneExt = numberWithDigitLength(3);
    user.primaryPhone = phone();
    user.userPhone = phone();
    user.businessPhone = phone();
    user.fax = phone();
    user.ssn = ssn();
    user.ssnTin = ssn();
    user.date = adultDateOfBirth();
    user.dob = user.date;
    return user;
  }

  async retryWithFreshProfile(product, user, reason) {
    if (this.isProfileValidation(reason)) {
      await this.attachDiagnostics();
      throw txocaError('TXOCA_PROFILE_MISMATCH',
        `TXOCA ${this.site.environment.key}/${product.key} rejected the registration identity: ${reason}. `
        + 'Random-profile retries were stopped. Inspect txoca-registration-diagnostics and application/server logs for the first-time registration rule. '
        + 'This response alone does not establish a locator defect or a requirement for seeded identities.',
      );
    }

    await super.retryWithFreshProfile(product, user, reason);
  }

  async isSuccessful() {
    if (await this.form.isRegistrationFormOpen()) return false;
    const bodyText = await this.form.bodyText();
    if (/Welcome|Logout|Dashboard|Application for New|Application Preliminary|successfully registered/i.test(bodyText)) {
      return true;
    }
    return /\/Protected\/|\/Dashboard/i.test(this.page.url());
  }

  async shouldRetryWhenFormStillOpen() {
    // BaseStrategy calls this only after duplicate/validation/success handling.
    // An unknown page or an unexplained open form is not evidence of success,
    // and changing personal data cannot establish what the server did.
    await this.attachDiagnostics();
    throw txocaError('TXOCA_UNCONFIRMED_OUTCOME', 'TXOCA returned no recognized registration success or validation outcome. Inspect the page and txoca-registration-diagnostics before retrying.');
  }
}

function programForProduct(product) {
  if (product.program) return product.program;
  if (product.key === 'CR') return 'Court Reporter Certification';
  if (product.key === 'PS') return 'Process Server Certification';
  if (product.key === 'CI') return 'Licensed Court Interpreter';
  return 'Guardians';
}

function txocaError(code, message) {
  return Object.assign(new Error(`[${code}] ${message}`), { code });
}

function normalizeRow(value) {
  return String(value).replace(/\s+/g, ' ').trim().replace(/[\s:.,;\-]+$/, '').toLowerCase();
}

function xpathLiteral(value) {
  const text = String(value);
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  return `concat(${text.split("'").map((part) => `'${part}'`).join(', "\"\'\"", ')})`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
