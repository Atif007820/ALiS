import { expect } from '@playwright/test';
import { HMB_DATA } from '../config/editableData.js';
import { URLS } from '../config/urls.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { randomDocumentPath } from '../utils/documentPool.js';
import {
  buildAddressInformation,
  buildApplicant,
  buildAttestation,
  buildAuthorizedLocation,
  buildOwner,
  expandPersonnelEntries,
} from '../utils/hmbDataFactory.js';
import {
  check,
  checkIfVisible,
  click,
  clickAndWait,
  fill,
  fillIfVisible,
  firstVisible,
  select,
  selectIfVisible,
  visibleDialog,
  waitAfterAction,
  waitForPageReady,
} from '../utils/formActions.js';
import { logger } from '../utils/logger.js';
import { DocumentUploadComponent } from './DocumentUploadComponent.js';

export class HmbLoginApplyPage {
  constructor(page) {
    this.page = page;
    this.documents = new DocumentUploadComponent(page);
  }

  async loginAndApply(user) {
    logger.section('Login and Apply for RA-HMB');
    await this.login(user);
    await this.openApplication();
    await this.fillEntityInformation();
    await this.fillApplicantInformation();
    await this.fillAddressInformation();
    await this.fillOwnerDirectorPersonnel();
    const mandatoryDocumentsUploaded = await this.uploadMandatoryDocuments();
    await this.addOtherAuthorizedLocation();
    await this.goToAttestation();
    const submitted = await this.submitApplication();
    const transactionNumber = submitted ? await this.completePayment() : 'Not submitted';

    return {
      submitted,
      transactionNumber,
      personnelDocumentsUploaded: this.personnelDocumentsUploaded,
      mandatoryDocumentsUploaded,
    };
  }

  async login(user) {
    await this.page.goto(URLS.loginUrl, { waitUntil: 'domcontentloaded', timeout: runSettings.navigationTimeout });
    await waitForPageReady(this.page);
    await this.selectHumanMilkBankPortal();
    await fill(this.page, this.page.getByRole('textbox', { name: /Login Name/i }), user.loginName, { label: 'Login Name' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Password/i }), user.password, { label: 'Password' });
    await clickAndWait(this.page, this.page.getByRole('link', { name: /^Login$/i }), { label: 'Login link', timeout: 60000 });
    await this.throwIfLoginFailed();
  }

  async selectHumanMilkBankPortal() {
    const portal = this.page.getByText('Human Milk Bank', { exact: true });
    if (await portal.first().isVisible().catch(() => false)) {
      await clickAndWait(this.page, portal.first(), { label: 'Human Milk Bank portal' });
    }
  }

  async throwIfLoginFailed() {
    const body = await this.page.locator('body').innerText().catch(() => '');
    if (/invalid login|login failed|incorrect password/i.test(body)) {
      throw new Error(`Login failed: ${body.replace(/\s+/g, ' ').trim().slice(0, 500)}`);
    }
  }

  async openApplication() {
    const applyLink = this.page.getByRole('link', { name: HMB_DATA.loginApply.applicationLink });
    const pendingLink = this.page.getByRole('link', { name: /View Pending Online Application/i }).first();

    const applyHref = await applyLink.getAttribute('href').catch(() => '');
    if (/already started|pending/i.test(decodeURIComponent(applyHref || '')) && await pendingLink.isVisible().catch(() => false)) {
      await this.openPendingApplication();
      return;
    }

    if (await applyLink.isVisible().catch(() => false)) {
      await clickAndWait(this.page, applyLink, { label: HMB_DATA.loginApply.applicationLink, timeout: 60000 });
      if (await this.page.getByRole('radio', { name: /Initial Registration/i }).isVisible().catch(() => false)) return;
      if (await pendingLink.isVisible().catch(() => false)) {
        await this.openPendingApplication();
        return;
      }
      return;
    }

    if (await pendingLink.isVisible().catch(() => false)) {
      await this.openPendingApplication();
      return;
    }

    throw new Error('Could not find Apply for RA-HMB or pending application link after login.');
  }

  async openPendingApplication() {
    logger.info('Pending RA-HMB application found; opening it.');
    await clickAndWait(this.page, this.page.getByRole('link', { name: /View Pending Online Application/i }).first(), {
      label: 'View Pending Online Application(s)',
      timeout: 60000,
    });

    const continueLink = this.page.getByRole('link', { name: /Continue Application/i }).first();
    if (await continueLink.isVisible().catch(() => false)) {
      await clickAndWait(this.page, continueLink, { label: 'Continue Application', timeout: 60000 });
    }
  }

  async fillEntityInformation() {
    logger.section('Entity Information');
    const { registrationType, services } = HMB_DATA.loginApply;
    const registrationRadio = await firstVisible([
      this.page.getByRole('radio', { name: /Deemed Status/i }).first(),
      this.page.getByRole('radio', { name: registrationType }).first(),
      this.page.getByRole('radio', { name: /Initial Registration and Accreditation/i }).first(),
    ], { label: 'Registration Type radio', timeout: 15000 }).catch(() => null);

    if (!registrationRadio) {
      logger.info('Entity Information page is already complete or not visible; skipping.');
      return;
    }

    await check(this.page, registrationRadio, { label: 'Registration Type radio' });

    for (const service of services) {
      await click(this.page, [
        this.page.locator('span').filter({ hasText: new RegExp(`^\\s*${escapeRegex(service)}\\s*$`, 'i') }),
        this.page.getByText(service, { exact: true }),
      ], { label: `${service} service` });
    }

    await clickAndWait(this.page, this.page.getByRole('button', { name: /^Next$/i }).first(), {
      label: 'Entity Information Next',
      timeout: 60000,
    });
  }

  async fillApplicantInformation() {
    logger.section('Applicant Information');
    const applicant = buildApplicant();
    if (!(await this.page.getByLabel('Ownership Type').isVisible().catch(() => false))) {
      logger.info('Applicant Information page is already complete or not visible; skipping.');
      return;
    }

    await select(this.page, this.page.getByLabel('Ownership Type'), applicant.ownershipType, { label: 'Ownership Type' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^First Name$/i }), applicant.firstName, { label: 'First Name' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Last Name$/i }), applicant.lastName, { label: 'Last Name' });
    await select(this.page, this.page.getByLabel('Role'), applicant.role, { label: 'Role' });
    await fill(this.page, this.page.getByRole('textbox', { name: /^Email$/i }), HMB_DATA.common.primaryEmail, { label: 'Email' });
    await fill(this.page, this.page.locator('#txtPhone, input[name="txtPhone"]').first(), applicant.phone, { label: 'Applicant Phone' });
    await clickAndWait(this.page, this.page.getByRole('button', { name: /^Next$/i }).nth(1), {
      label: 'Applicant Information Next',
      timeout: 60000,
    });
  }

  async fillAddressInformation() {
    logger.section('Address Information');
    const address = buildAddressInformation();
    if (!(await this.page.locator('#ContactName_PHL').isVisible().catch(() => false))) {
      logger.info('Address Information page is already complete or not visible; skipping.');
      return;
    }

    await fillIfVisible(this.page, this.page.locator('#ContactName_MLG'), address.mailingContactName, { label: 'Mailing Contact Name' });
    await fill(this.page, this.page.locator('#ContactName_PHL'), address.physicalContactName, { label: 'Physical Contact Name' });
    await fill(this.page, this.page.locator('#txtAddress_PHL'), address.physicalAddress, { label: 'Physical Address' });
    await fill(this.page, this.page.locator('#lblApt_PHL'), address.physicalApt, { label: 'Physical Apt' });
    await fill(this.page, this.page.locator('#txtCity_PHL'), address.physicalCity, { label: 'Physical City' });
    await fill(this.page, this.page.locator('#txtZip_PHL'), address.physicalZip, { label: 'Physical Zip' });
    await this.selectAndVerify(this.page.locator('#ddlCounty_PHL'), address.physicalCounty, 'Physical County');
    await fill(this.page, this.page.locator('#txtPrimaryPhone_PHL'), address.physicalPrimaryPhone, { label: 'Physical Primary Phone' });
    await fillIfVisible(this.page, this.page.locator('#txtAlternatePhone_PHL'), address.physicalAlternatePhone, { label: 'Physical Alternate Phone' });
    await fill(this.page, this.page.locator('#txtFax_PHL'), address.physicalFax, { label: 'Physical Fax' });
    await fill(this.page, this.page.locator('#txtPrimaryEmail_PHL'), HMB_DATA.common.primaryEmail, { label: 'Physical Primary Email' });
    await fill(this.page, this.page.locator('#txtAlternateEmail_PHL'), HMB_DATA.common.alternateEmail, { label: 'Physical Alternate Email' });
    await fill(this.page, this.page.getByRole('textbox', { name: 'Web Site URL' }), address.webSiteUrl, { label: 'Website URL' });
    await select(this.page, this.page.locator('#ddlCopy_RAA'), address.copyResidentialAddress, { label: 'Residential Copy From' });
    await fillIfVisible(this.page, this.page.locator('#txtAlternatePhone_RAA'), address.physicalAlternatePhone, {
      label: 'Residential Alternate Phone',
    });
    await clickAndWait(this.page, this.page.getByRole('button', { name: /^Next$/i }).nth(1), {
      label: 'Address Information Next',
      timeout: 60000,
    });
  }

  async fillOwnerDirectorPersonnel() {
    logger.section('Owner, Director and Personnel');
    if (await this.isAttestationPageVisible()) {
      logger.info('Owner/Personnel page is already complete; application is on Attestation.');
      this.personnelDocumentsUploaded = 0;
      return;
    }

    if (await this.isMandatoryDocumentsPageVisible()) {
      logger.info('Owner/Personnel page is already complete; continuing from Mandatory Documents.');
      this.personnelDocumentsUploaded = 0;
      return;
    }

    await this.addOwner();
    this.personnelDocumentsUploaded = await this.addPersonnel();
    await this.goFromPersonnelToMandatoryDocuments();
  }

  async isMandatoryDocumentsPageVisible() {
    return this.page
      .getByRole('heading', { name: /Mandatory Required Document/i })
      .isVisible()
      .catch(() => false);
  }

  async addOwner() {
    if (await this.ownerAlreadyAdded()) {
      logger.info('Ownership row already exists; skipping owner add.');
      return;
    }

    const owner = buildOwner();
    await click(this.page, [
      this.page.locator('#divOwnershipInfo').getByRole('link', { name: /^Add$/i }),
      this.page.locator('cc-ownership-info').getByRole('link', { name: /^Add$/i }),
    ], { label: 'Owner Add link', timeout: 60000 });

    const dialog = await visibleDialog(this.page, /Ownership|Last Name|Contact Person/i, 'Ownership dialog');
    await fill(this.page, dialog.getByRole('textbox', { name: /^Last Name$/i }), owner.lastName, { label: 'Owner Last Name' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^First Name$/i }), owner.firstName, { label: 'Owner First Name' });
    await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /^Comments$/i }), owner.comments, { label: 'Owner Comments' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Contact Person$/i }), owner.contactPerson, { label: 'Owner Contact Person' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Address$/i }), owner.address, { label: 'Owner Address' });
    await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /Suite|Apt|Unit/i }), owner.apt, { label: 'Owner Apt' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^City$/i }), owner.city, { label: 'Owner City' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Zip$/i }), owner.zip, { label: 'Owner Zip' });
    await selectIfVisible(this.page, dialog.getByLabel('County'), owner.county, { label: 'Owner County' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Primary Phone #$/i }), owner.primaryPhone, { label: 'Owner Phone' });
    await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /^Alternate Phone #$/i }), owner.alternatePhone, {
      label: 'Owner Alternate Phone',
    });
    await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /^Fax$/i }), owner.fax, { label: 'Owner Fax' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Primary E-mail$/i }), HMB_DATA.common.primaryEmail, {
      label: 'Owner Primary Email',
    });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Alternate E-mail$/i }), HMB_DATA.common.alternateEmail, {
      label: 'Owner Alternate Email',
    });
    await this.saveDialog(dialog, 'Owner');
  }

  async ownerAlreadyAdded() {
    const ownerSection = this.page.locator('#divOwnershipInfo, cc-ownership-info').first();
    if (!(await ownerSection.isVisible().catch(() => false))) return false;

    const text = await ownerSection.innerText().catch(() => '');
    return /MOHDATIF\.JAMAL@OPS1\.ADVANCEDGRC\.COM|1 to \d+ of \d+/i.test(text)
      && !/Please click 'Add' to add a new row\.\s*$/i.test(text.trim());
  }

  async addPersonnel() {
    let uploaded = 0;
    const existingRoleCounts = await this.personnelRoleCounts();
    if ([...existingRoleCounts.values()].some((count) => count > 0)) {
      logger.info('Personnel rows already exist; adding only missing roles and scanning for pending Documents (0).');
    }

    for (const entry of expandPersonnelEntries()) {
      const roleKey = normalizeRole(entry.role);
      const existingCount = existingRoleCounts.get(roleKey) || 0;
      if (existingCount >= entry.occurrence) {
        logger.info(`Personnel already exists: ${entry.role}${entry.occurrence > 1 ? ` #${entry.occurrence}` : ''}. Skipping add.`);
        continue;
      }

      logger.info(`Adding Personnel: ${entry.role}${entry.occurrence > 1 ? ` #${entry.occurrence}` : ''}`);
      await click(this.page, this.personnelAddLink(), { label: 'Personnel Add link', timeout: 60000 });
      const dialog = await visibleDialog(this.page, /Personnel|Last Name|Primary E-mail/i, 'Personnel dialog');

      await fill(this.page, dialog.getByRole('textbox', { name: /^Last Name$/i }), entry.lastName, { label: 'Personnel Last Name' });
      await fill(this.page, dialog.getByRole('textbox', { name: /^First Name$/i }), entry.firstName, { label: 'Personnel First Name' });
      await this.checkPersonnelRole(dialog, entry);
      await checkIfVisible(this.page, dialog.getByRole('radio', { name: entry.boardCertified || 'No', exact: true }), {
        label: 'Board Certified option',
      });
      await fill(this.page, dialog.getByRole('textbox', { name: /^Address$/i }), entry.address, { label: 'Personnel Address' });
      await fill(this.page, dialog.getByRole('textbox', { name: /^City$/i }), entry.city, { label: 'Personnel City' });
      await fill(this.page, dialog.getByRole('textbox', { name: /^Zip$/i }), entry.zip, { label: 'Personnel Zip' });
      await fill(this.page, dialog.getByRole('textbox', { name: /^Primary Phone #$/i }), entry.primaryPhone, {
        label: 'Personnel Primary Phone',
      });
      await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /^Alternate Phone #$/i }), entry.alternatePhone, {
        label: 'Personnel Alternate Phone',
      });
      await fill(this.page, dialog.getByRole('textbox', { name: /^Primary E-mail$/i }), HMB_DATA.common.primaryEmail, {
        label: 'Personnel Primary Email',
      });
      await fill(this.page, dialog.getByRole('textbox', { name: /^Alternate E-mail$/i }), HMB_DATA.common.alternateEmail, {
        label: 'Personnel Alternate Email',
      });
      await this.saveDialog(dialog, `Personnel ${entry.role}`);
      await this.uploadLatestPersonnelDocument(entry.uploadComment || 'Test');
      existingRoleCounts.set(roleKey, existingCount + 1);
      uploaded += 1;
    }

    return uploaded + await this.uploadPendingPersonnelDocumentsAcrossPages();
  }

  async personnelRoleCounts() {
    const section = this.page.locator('cc-agency-personnel-info');
    const counts = new Map(HMB_DATA.loginApply.personnel.map((entry) => [normalizeRole(entry.role), 0]));
    if (!(await section.isVisible().catch(() => false))) return counts;

    await this.clickPersonnelPager('first').catch(() => false);

    for (let pageIndex = 1; pageIndex <= 5; pageIndex++) {
      const text = normalizeRole(await section.innerText().catch(() => ''));
      for (const entry of HMB_DATA.loginApply.personnel) {
        const roleKey = normalizeRole(entry.role);
        const matches = text.match(new RegExp(escapeRegex(roleKey), 'g')) || [];
        counts.set(roleKey, (counts.get(roleKey) || 0) + matches.length);
      }

      const movedNext = await this.clickPersonnelPager('next');
      if (!movedNext) break;
    }

    await this.clickPersonnelPager('first').catch(() => false);
    return counts;
  }

  async uploadPendingPersonnelDocumentsAcrossPages() {
    let uploaded = 0;
    await this.clickPersonnelPager('first').catch(() => false);

    for (let pageIndex = 1; pageIndex <= 5; pageIndex++) {
      while (await this.pendingPersonnelDocumentLink().isVisible().catch(() => false)) {
        await this.documents.uploadFromLink(this.pendingPersonnelDocumentLink(), randomDocumentPath(), 'Test');
        uploaded += 1;
      }

      const movedNext = await this.clickPersonnelPager('next');
      if (!movedNext) break;
    }

    if (uploaded > 0) {
      logger.info(`Uploaded ${uploaded} pending personnel document(s).`);
    }

    return uploaded;
  }

  pendingPersonnelDocumentLink() {
    return this.page
      .locator('cc-agency-personnel-info a[data-action-type="Document"]')
      .filter({ hasText: /Documents\s*\(\s*0\s*\)/i })
      .first();
  }

  async clickPersonnelPager(action) {
    const scope = this.page.locator('cc-agency-personnel-info');
    const button = await firstVisible([
      scope.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }),
      scope.locator(`button.image-button-${action}, button[aria-label="${action}"], .image-button-${action}`),
    ], { label: `Personnel ${action} pager`, timeout: 1500 }).catch(() => null);

    if (!button) return false;
    if (!(await button.isEnabled().catch(() => false))) return false;

    await clickAndWait(this.page, button, { label: `Personnel ${action} page`, timeout: 60000 });
    return true;
  }

  personnelAddLink() {
    return this.page
      .locator('cc-agency-personnel-info')
      .getByRole('link', { name: /^Add$/i })
      .or(this.page.locator('cc-agency-personnel-info a#custom-add0'))
      .or(this.page.locator('cc-agency-personnel-info a[data-action-type="Add"]'));
  }

  async checkPersonnelRole(dialog, entry) {
    const roleByLabel = dialog.getByRole('radio', { name: entry.role, exact: true });
    if (await roleByLabel.isVisible().catch(() => false)) {
      await check(this.page, roleByLabel, { label: `${entry.role} radio` });
      return;
    }

    const roleByPartialLabel = dialog.getByRole('radio', { name: new RegExp(escapeRegex(entry.role), 'i') });
    if (await roleByPartialLabel.isVisible().catch(() => false)) {
      await check(this.page, roleByPartialLabel, { label: `${entry.role} radio` });
      return;
    }

    await check(this.page, dialog.locator(`mat-radio-group[formcontrolname="Role"] input[type="radio"][value="${entry.roleValue}"]`), {
      label: `${entry.role} value radio`,
    });
  }

  async uploadLatestPersonnelDocument(comment = 'Test') {
    const link = this.page
      .locator('cc-agency-personnel-info a[data-action-type="Document"]')
      .filter({ hasText: /Documents\s*\(\s*0\s*\)/i })
      .last();

    await this.documents.uploadFromLink(link, randomDocumentPath(), comment);
  }

  async goFromPersonnelToMandatoryDocuments() {
    await clickAndWait(this.page, [
      this.page.locator('cc-agency-personnel-info button').filter({ hasText: /^Next$/i }).last(),
      this.page.getByRole('button', { name: /^Next$/i }).last(),
    ], { label: 'Personnel Next', timeout: 60000 });
  }

  async uploadMandatoryDocuments() {
    logger.section('Mandatory Required Documents');
    if (await this.isAttestationPageVisible()) {
      logger.info('Mandatory documents are already complete; application is on Attestation.');
      return 0;
    }

    let uploaded = 0;

    for (const doc of HMB_DATA.loginApply.mandatoryDocuments) {
      const link = await this.ensureMandatoryDocumentLink(doc.id);
      const linkText = await link.innerText().catch(() => '');
      if (!/Documents\s*\(\s*0\s*\)/i.test(linkText)) {
        logger.info(`${doc.id} already has uploaded document(s): ${linkText.trim()}. Skipping.`);
        continue;
      }

      await this.documents.uploadFromLink(link, randomDocumentPath(), runSettings.uploadComment || 'Test12');
      uploaded += 1;
    }

    return uploaded;
  }

  async ensureMandatoryDocumentLink(docId) {
    const prefix = docId.replace(/-\d+$/, '-');

    for (let attempt = 1; attempt <= 5; attempt++) {
      const link = this.page.locator(`#${docId}`).or(this.page.locator(`a[id^="${prefix}"]`)).first();
      if (await link.isVisible().catch(() => false)) return link;

      const moved = await this.clickMandatoryPager('next')
        || await this.clickMandatoryPager('last')
        || await this.clickMandatoryPager('first');

      if (!moved) break;
    }

    const rows = await this.page
      .locator('#MandatoryDocument tr, cc-mandatory-document tr, table tr')
      .evaluateAll((elements) => elements.map((row) => row.innerText?.replace(/\s+/g, ' ').trim()).filter(Boolean))
      .catch(() => []);

    throw new Error(`Mandatory document link "${docId}" was not found. Visible rows: ${JSON.stringify(rows.slice(0, 12))}`);
  }

  async clickMandatoryPager(action) {
    const scope = this.page.locator('#MandatoryDocument, cc-mandatory-document').first();
    const button = await firstVisible([
      scope.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }),
      scope.locator(`button.image-button-${action}, button[aria-label="${action}"], .image-button-${action}`),
      this.page.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }),
    ], { label: `Mandatory ${action} pager`, timeout: 1500 }).catch(() => null);

    if (!button) return false;
    if (!(await button.isEnabled().catch(() => false))) return false;

    await clickAndWait(this.page, button, { label: `Mandatory ${action} page`, timeout: 60000 });
    return true;
  }

  async addOtherAuthorizedLocation() {
    logger.section('Other Authorized Location');
    if (await this.isAttestationPageVisible()) {
      logger.info('Other Authorized Location step is already complete; application is on Attestation.');
      return;
    }

    const location = buildAuthorizedLocation();

    await click(this.page, this.page.getByRole('link', { name: /^Add$/i }).last(), {
      label: 'Other Authorized Location Add',
      timeout: 60000,
    });

    const dialog = await visibleDialog(this.page, /HMB Service|Primary E-mail|Name/i, 'Other Authorized Location dialog');
    await fill(this.page, dialog.getByRole('textbox', { name: /^Name$/i }), location.name, { label: 'Authorized Location Name' });
    await fill(this.page, dialog.getByRole('textbox', { name: /HMB Service\(s\) Performed/i }), location.servicesPerformed, {
      label: 'HMB Services Performed',
    });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Address$/i }), location.address, { label: 'Authorized Location Address' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Zip$/i }), location.zip, { label: 'Authorized Location Zip' });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Primary Phone #$/i }), location.primaryPhone, {
      label: 'Authorized Location Primary Phone',
    });
    await fillIfVisible(this.page, dialog.getByRole('textbox', { name: /^Alternate Phone #$/i }), location.alternatePhone, {
      label: 'Authorized Location Alternate Phone',
    });
    await fill(this.page, dialog.getByRole('textbox', { name: /^Primary E-mail$/i }), HMB_DATA.common.primaryEmail, {
      label: 'Authorized Location Primary Email',
    });
    await fill(this.page, dialog.getByRole('textbox', { name: /^City$/i }), location.city, { label: 'Authorized Location City' });
    await selectIfVisible(this.page, dialog.getByLabel('County'), HMB_DATA.common.defaultCounty, {
      label: 'Authorized Location County',
    });
    await this.saveDialog(dialog, 'Other Authorized Location');
  }

  async goToAttestation() {
    if (await this.isAttestationPageVisible()) {
      logger.info('Already on Attestation; no navigation needed.');
      return;
    }

    await clickAndWait(this.page, this.page.getByRole('button', { name: /^Next$/i }).last(), {
      label: 'Additional Information Next',
      timeout: 60000,
    });
  }

  async isAttestationPageVisible() {
    return this.page
      .getByRole('heading', { name: /^Attestation$/i })
      .isVisible()
      .catch(() => false);
  }

  async submitApplication() {
    logger.section('Attestation');
    const attestation = buildAttestation();

    await check(this.page, this.page.getByRole('checkbox', { name: /I, the undersigned, certify/i }), {
      label: 'Certification checkbox',
      timeout: 60000,
    });
    await fill(this.page, this.page.getByRole('textbox', { name: /Operator\*/i }), attestation.operator, {
      label: 'Operator',
    });

    if (!runSettings.submitApplication) {
      logger.warn('submitApplication=false. Application not submitted.');
      return false;
    }

    await clickAndWait(this.page, this.page.getByRole('button', { name: /^Submit Application$/i }), {
      label: 'Submit Application',
      timeout: 60000,
    });
    return true;
  }

  async completePayment() {
    if (!runSettings.submitPayment) {
      logger.warn('submitPayment=false. Payment not submitted.');
      return 'Payment skipped';
    }

    logger.section('Payment');
    let payButton = this.page.getByRole('button', { name: /Submit Application and Pay By/i });
    if (!(await payButton.isVisible().catch(() => false))) {
      await this.page.goto(URLS.feeDetailUrl, { waitUntil: 'domcontentloaded', timeout: runSettings.navigationTimeout });
      await waitForPageReady(this.page);
      payButton = this.page.getByRole('button', { name: /Submit Application and Pay By/i });
    }

    if (!(await payButton.isVisible().catch(() => false))) {
      const pageText = await this.page.locator('body').innerText().catch(() => '');
      logger.warn(`Payment button was not visible on Fee Detail. Page text: ${pageText.replace(/\s+/g, ' ').trim().slice(0, 500)}`);
      return 'Not captured - payment button not visible';
    }

    await clickAndWait(this.page, payButton, { label: 'Submit Application and Pay By', timeout: 60000 });
    const transactionNumber = await this.captureTransactionNumber();
    logger.info(`Transaction Number: ${transactionNumber}`);
    return transactionNumber;
  }

  async captureTransactionNumber() {
    const body = await this.page.locator('body').innerText().catch(() => '');
    const labeled = body.match(/(?:Transaction|Confirmation|Application|Receipt)\s*(?:Number|No\.?|#)?\s*:?\s*(\d{4,})/i);
    if (labeled) return labeled[1];

    const visibleNumber = this.page.getByText(/^\d{4,}$/).first();
    if (await expect(visibleNumber).toBeVisible({ timeout: 10000 }).then(() => true).catch(() => false)) {
      return (await visibleNumber.textContent())?.trim() || 'Not captured';
    }

    const fallback = body.match(/\b\d{4,}\b/);
    return fallback?.[0] || 'Not captured';
  }

  async selectAndVerify(locator, value, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await select(this.page, locator, value, { label: `${label} attempt ${attempt}` });
      await waitAfterAction(this.page);
      const actual = await locator.inputValue().catch(() => '');
      if (actual === value) return;
      logger.warn(`${label} reset after selection. Expected "${value}", actual "${actual}".`);
    }

    throw new Error(`Could not persist ${label} selection "${value}".`);
  }

  async saveDialog(dialog, label) {
    const isBodyScope = await dialog
      .evaluate((element) => element.tagName?.toLowerCase() === 'body')
      .catch(() => false);

    await clickAndWait(this.page, dialog.getByRole('button', { name: /^Save$/i }), {
      label: `Save ${label}`,
      timeout: 60000,
    });

    if (isBodyScope) {
      await waitAfterAction(this.page);
      return;
    }

    await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await waitAfterAction(this.page);

    if (await dialog.isVisible().catch(() => false)) {
      const text = await dialog.innerText().catch(() => '');
      throw new Error(`${label} dialog stayed open after Save. Text: ${text.replace(/\s+/g, ' ').slice(0, 1000)}`);
    }
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRole(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}
