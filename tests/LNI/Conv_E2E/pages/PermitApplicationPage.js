import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { appConfig } from '../config/runConfig.js';
import { TEST_DATA } from '../config/editableData.js';
import {
  COMM_CONVEYANCE_TYPES,
  RESIDENTIAL_CONVEYANCE_TYPES,
} from '../config/constants.js';
import {
  checkRandomAvailableRadio,
  fillField,
  isVisible,
  safeSelect,
} from '../utils/formActions.js';
import {
  pick,
  randomAlphaAddress,
  randomBuildingName,
  randomEnglishName,
  randomPhone10,
  randomSuiteAptUnit,
  randomUBI,
  randomUSCity,
  randomUSState,
  randomZip5_5,
} from '../utils/randomData.js';
import { logger } from '../utils/logger.js';
import { MachineInformationPage } from './MachineInformationPage.js';
import { DocumentUploadComponent } from './components/DocumentUploadComponent.js';

export class PermitApplicationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.machineInformation  = new MachineInformationPage(page);
    this.documents           = new DocumentUploadComponent(page);
    this.newConveyanceRadio  = page.getByRole('radio', { name: 'New Conveyance Installation' });
    this.confirmationHeading = page.getByRole('heading', { name: 'Confirmation' });
  }

  /**
   * End-to-end orchestration for a New Conveyance permit application.
   * Calls each step method in order and returns the license/conveyance selection.
   *
   * @param {{ onSelection?: (selection: { licenseType: string, conveyanceType: string, typeName: string }) => void | Promise<void> }} [options]
   * @returns {Promise<{ licenseType: string, conveyanceType: string, typeName: string }>}
   */
  async completeNewConveyancePermitApplication({ onSelection } = {}) {
    const selection = await this.selectApplicationTypeAndLicense();
    await onSelection?.(selection);
    await this.continueFromEntityInformation();
    await this.fillAddressInformation();
    await this.fillOwnerInformation();
    await this.documents.uploadVisibleMandatoryDocuments();
    await this.machineInformation.fill();
    await this.goToReviewQuestions();
    await this.answerReviewQuestions();
    await this.attestSubmitAndPay();
    await this.expectConfirmation();
    return selection;
  }

  // ─── Step Methods ─────────────────────────────────────────────────────────

  async selectApplicationTypeAndLicense() {
    await this.waitForVisible(this.newConveyanceRadio, 150000);
    await this.newConveyanceRadio.check();

    const selection = await this.selectConfiguredLicenseAndConveyance();
    logger.info(`Conveyance type: ${selection.conveyanceType}`);

    await this.page.getByRole('button', { name: 'Next' }).click();
    return selection;
  }

  /**
   * Selects the license type from config and a random conveyance type.
   * @returns {Promise<{ licenseType: string, conveyanceType: string, typeName: string }>}
   */
  async selectConfiguredLicenseAndConveyance() {
    const licenseType   = appConfig.licenseType;
    const licenseRadios = this.page.getByRole('radio', { name: 'License Type' });

    if (licenseType === 'RESIDENTIAL') {
      const radio = licenseRadios.first();
      await this.waitForVisible(radio, 150000);
      await radio.check();
      logger.info('License Type selected: RESIDENTIAL');
      await this.waitForConveyanceRadios('residential conveyance type');
      const conveyanceType = await checkRandomAvailableRadio(this.page, RESIDENTIAL_CONVEYANCE_TYPES, {
        label: 'residential conveyance type',
        timeout: 10000,
      });
      return { licenseType, conveyanceType, typeName: conveyanceType };
    }

    if (licenseType === 'COMMERCIAL') {
      const radio = licenseRadios.nth(1);
      await this.waitForVisible(radio, 150000);
      await radio.check();
      logger.info('License Type selected: COMMERCIAL');
      await this.waitForConveyanceRadios('commercial conveyance type');
      const conveyanceType = await checkRandomAvailableRadio(this.page, COMM_CONVEYANCE_TYPES, {
        label: 'commercial conveyance type',
        timeout: 10000,
      });
      return { licenseType, conveyanceType, typeName: conveyanceType };
    }

    throw new Error(`Unsupported LICENSE_TYPE "${licenseType}". Use RESIDENTIAL or COMMERCIAL.`);
  }

  async continueFromEntityInformation() {
    const entityNext = this.page.getByRole('button', { name: 'Next' }).nth(1);
    await this.waitForVisible(entityNext, 15000);
    await entityNext.click();
  }

  async fillAddressInformation() {
    await this.page.locator('#ddlCopy_LMA').waitFor({ state: 'visible', timeout: 150000 });
    await this.waitForLoad('domcontentloaded');

    try {
      await safeSelect(this.page.locator('#ddlCopy_LMA'),    TEST_DATA.lmaCopySource);
      await fillField (this.page.locator('#ContactName_LMA'), randomEnglishName());
      await fillField (this.page.locator('#txtAlternatePhone_LMA'), randomPhone10());
      await fillField (this.page.locator('#txtFax_LMA'),      randomPhone10());

      await safeSelect(this.page.locator('#ddlCopy_SLA'),    TEST_DATA.slaCopySource);
      await fillField (this.page.locator('#ContactName_SLA'), randomEnglishName());

      await fillField(this.page.getByRole('textbox', { name: 'Building Name' }),  randomBuildingName());
      await fillField(this.page.getByRole('textbox', { name: 'Location Notes' }), TEST_DATA.locationNotes);

      await safeSelect(this.page.locator('#ddlCopy_CON'),    TEST_DATA.contractorCopySource);
      await fillField (this.page.locator('#ContactName_CON'), randomEnglishName());
    } catch (error) {
      logger.warn(`Address step error (retrying after page settle): ${error.message.split('\n')[0]}`);
      await this.waitForLoad('networkidle');
    }

    await this.page.getByRole('button', { name: 'Next' }).nth(1).click();
    await this.waitForLoad('domcontentloaded');
  }

  async fillOwnerInformation() {
    await this.waitForLoad('domcontentloaded');

    const ownerExistsDropdown = await this.openOwnerInformationDialog();

    let ownerExistsValue = pick(TEST_DATA.ownerExistsOptions);
    const configuredExistingUbi = TEST_DATA.ownerExistingUbiByEnvironment[appConfig.environment];

    if (ownerExistsValue === 'Y' && !configuredExistingUbi) {
      logger.warn(`No existing owner UBI configured for ${appConfig.environment}; using Owner Exists: N.`);
      ownerExistsValue = 'N';
    }

    logger.info(`Owner Exists: ${ownerExistsValue}`);
    await safeSelect(ownerExistsDropdown, ownerExistsValue);
    await this.waitForLoad('domcontentloaded');

    if (ownerExistsValue === 'Y') {
      const ownerExistingUbi = configuredExistingUbi;
      if (!ownerExistingUbi) {
        throw new Error(`Missing existing owner UBI for ${appConfig.environment}. Add it in TEST_DATA.ownerExistingUbiByEnvironment.`);
      }

      logger.info(`Existing Owner UBI (${appConfig.environment}): ${ownerExistingUbi}`);
      await fillField(this.page.getByRole('textbox', { name: 'UBI #' }), ownerExistingUbi, { pressTab: false });
      await this.page.getByRole('button', { name: 'Search' }).click();

      const saveBtn = this.page.getByRole('button', { name: 'Save' });
      await this.waitForVisible(saveBtn, 150000);
      await saveBtn.click();
      await this.page.locator('mat-dialog-container').waitFor({ state: 'hidden', timeout: 150000 }).catch(() => {});
    } else {
      await fillField(this.page.locator('#txtUBI1'),                                          randomUBI());
      await fillField(this.page.getByRole('textbox', { name: 'Owner Name' }),                 randomEnglishName());
      await fillField(this.page.getByRole('textbox', { name: 'Comments' }),                   TEST_DATA.ownerComments);
      await fillField(this.page.getByRole('textbox', { name: 'Contact Name' }),               randomEnglishName());
      await fillField(this.page.getByRole('textbox', { name: 'Address' }),                    randomAlphaAddress());
      await fillField(this.page.getByRole('textbox', { name: 'City' }),                       randomUSCity());
      await fillField(this.page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }),        randomSuiteAptUnit());
      await safeSelect(this.page.getByLabel('State/Province'),                                randomUSState());
      await fillField(this.page.getByRole('textbox', { name: 'Zip' }),                        randomZip5_5());
      await fillField(this.page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), randomPhone10());
      await fillField(this.page.getByRole('textbox', { name: 'Alternate Phone #', exact: true }), randomPhone10());
      await fillField(this.page.getByRole('textbox', { name: 'Fax' }),                        randomPhone10());
      await fillField(this.page.getByRole('textbox', { name: 'Primary E-mail' }),             TEST_DATA.businessEmail);
      await fillField(this.page.getByRole('textbox', { name: 'Alternate E-mail' }),           TEST_DATA.alternateEmail);

      const saveBtn = this.page.getByRole('button', { name: 'Save' });
      await this.waitForVisible(saveBtn, 10000);
      await saveBtn.click();
      await this.waitForLoad();
    }

    const nextAfterSave = this.page.getByRole('button', { name: 'Next' }).nth(2);
    await this.waitForVisible(nextAfterSave, 150000);
    await nextAfterSave.click();
    await this.waitForLoad('domcontentloaded');
  }

  async goToReviewQuestions() {
    const nextToReview = this.page.getByRole('button', { name: 'Next' }).nth(2);
    await this.waitForVisible(nextToReview, 100000);
    await nextToReview.click();
  }

  async answerReviewQuestions() {
    const questionsSection = this.page.locator('sh-questions, section.questionsList-container').first();
    const hasQuestions = await questionsSection
      .waitFor({ state: 'visible', timeout: 150000 })
      .then(() => true)
      .catch(() => false);

    if (!hasQuestions) {
      logger.info('No review questions were visible; continuing to attestation.');
      return;
    }

    const questionItems = questionsSection.locator('.question-item');
    const hasQuestionItems = await questionItems.first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!hasQuestionItems) {
      logger.info('Questions section was visible, but no question rows appeared; continuing to attestation.');
      return;
    }

    const questionCount = await questionItems.count();
    logger.info(`Question items found: ${questionCount}`);

    for (let index = 0; index < questionCount; index++) {
      const questionItem = questionItems.nth(index);
      if (!(await isVisible(questionItem, 5000))) {
        logger.info(`Skipping review question ${index + 1}: not visible`);
        continue;
      }

      if ((await questionItem.locator('input[type="radio"]').count()) === 0) {
        logger.info(`Skipping review question ${index + 1}: no radio inputs`);
        continue;
      }

      await this.answerQuestionItem(questionItem, index);
    }

    const unansweredQuestions = await this.getUnansweredQuestionTexts(questionsSection);
    if (unansweredQuestions.length > 0) {
      throw new Error(
        `Question tab still has unanswered required radio question(s): ${unansweredQuestions.join(' | ')}`
      );
    }
  }

  async attestSubmitAndPay() {
    const attestCheckbox = await this.openAttestationFromQuestions();
    await attestCheckbox.check();

    const submitBtn = this.page.getByRole('button', { name: 'Submit Application' });
    await this.waitForVisible(submitBtn, 100000);
    await submitBtn.click();

    const payNowBtn = this.page.getByRole('button', { name: 'Pay Now' });
    await this.waitForVisible(payNowBtn, 200000);
    await payNowBtn.click();
  }

  async expectConfirmation() {
    await expect(this.confirmationHeading).toBeVisible({ timeout: 20000 });
    logger.success('Application submitted successfully');
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  async answerQuestionItem(questionItem, index) {
    const questionText = await this.getQuestionText(questionItem);
    const answersToTry = this.getQuestionAnswerCandidates(questionText, index);

    for (const answer of answersToTry) {
      const checked = await this.checkQuestionRadioAnswer(questionItem, answer);
      if (checked) {
        logger.info(`Answered review question ${index + 1}: ${answer} (${questionText})`);
        return;
      }
    }

    const labels = await this.getQuestionAnswerLabels(questionItem);
    throw new Error(
      `No configured answer could be selected for review question ${index + 1}: ` +
      `"${questionText}". Available answers: ${labels.join(', ')}`
    );
  }

  async getQuestionText(questionItem) {
    const text = await questionItem.locator('.q-alert span').first()
      .innerText({ timeout: 3000 })
      .catch(async () => questionItem.innerText({ timeout: 3000 }).catch(() => 'Unknown question'));

    return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  }

  getQuestionAnswerCandidates(questionText, index) {
    const normalizedQuestion = this.normalizeText(questionText);
    const rule = TEST_DATA.reviewQuestionAnswerRules.find(({ questionIncludes }) => (
      normalizedQuestion.includes(this.normalizeText(questionIncludes))
    ));

    const candidates = [
      rule?.answer,
      TEST_DATA.reviewAnswers[index],
      ...(TEST_DATA.reviewFallbackAnswerOrder ?? []),
    ].filter((answer) => answer && this.normalizeText(answer) !== 'yes');

    return [...new Set(candidates)];
  }

  async checkQuestionRadioAnswer(questionItem, answer) {
    const match = await questionItem.locator('input[type="radio"]').evaluateAll((inputs, answerText) => {
      const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const wanted = normalize(answerText);

      for (const input of inputs) {
        const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
        const text = normalize(label?.textContent ?? input.getAttribute('aria-label') ?? input.value);
        if (text === wanted) {
          return {
            inputId: input.id,
            label: String(label?.textContent ?? input.getAttribute('aria-label') ?? input.value).trim(),
          };
        }
      }

      return null;
    }, answer);

    if (!match?.inputId) return false;

    const input = questionItem.locator(`input[id="${match.inputId}"]`).first();
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.check({ force: true, timeout: 10000 }).catch(async () => {
      await input.evaluate((element) => {
        const label = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
        const clickable = label ?? element.closest('mat-radio-button') ?? element;
        clickable.click();
      });
    });

    const isChecked = await input.isChecked().catch(() => false);
    if (!isChecked) return false;

    logger.debug(`Selected question radio: ${match.label}`);
    return true;
  }

  async getQuestionAnswerLabels(questionItem) {
    return questionItem.locator('input[type="radio"]').evaluateAll((inputs) => (
      inputs.map((input) => {
        const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
        return String(label?.textContent ?? input.getAttribute('aria-label') ?? input.value).replace(/\s+/g, ' ').trim();
      }).filter(Boolean)
    )).catch(() => []);
  }

  async getUnansweredQuestionTexts(questionsSection) {
    const questionItems = questionsSection.locator('.question-item');
    const total = await questionItems.count();
    const unanswered = [];

    for (let index = 0; index < total; index++) {
      const questionItem = questionItems.nth(index);
      if ((await questionItem.locator('input[type="radio"]').count()) === 0) continue;

      const hasCheckedRadio = await questionItem.locator('input[type="radio"]').evaluateAll((inputs) => (
        inputs.some((input) => input.checked)
      )).catch(() => false);

      if (!hasCheckedRadio) {
        unanswered.push(await this.getQuestionText(questionItem));
      }
    }

    return unanswered;
  }

  async openAttestationFromQuestions() {
    const attestCheckbox = this.page.getByRole('checkbox', { name: /I attest/i }).first();
    if (await isVisible(attestCheckbox, 2000)) return attestCheckbox;

    const nextButtons = this.page.getByRole('button', { name: /^Next$/ });
    const nextCount = await nextButtons.count();
    const nextToAttest = nextCount > 1 ? nextButtons.nth(1) : nextButtons.first();

    await this.waitForVisible(nextToAttest, 100000);
    await nextToAttest.click();
    await this.waitForLoad('domcontentloaded');

    if (await isVisible(attestCheckbox, 150000)) return attestCheckbox;

    const questionsSection = this.page.locator('sh-questions, section.questionsList-container').first();
    if (await isVisible(questionsSection, 2000)) {
      const unansweredQuestions = await this.getUnansweredQuestionTexts(questionsSection);
      const pageText = await this.page.locator('main').innerText({ timeout: 5000 }).catch(() => '');
      throw new Error(
        `Could not proceed from Questions to Attestation. ` +
        `Unanswered questions: ${unansweredQuestions.join(' | ') || 'none detected'}. ` +
        `Visible page text: ${pageText.slice(0, 500)}`
      );
    }

    throw new Error(`Attestation checkbox was not visible after clicking Next. Current URL: ${this.currentUrl()}`);
  }

  normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  async openOwnerInformationDialog() {
    const ownerExistsDropdown = this.page.getByLabel('Does the owner already exist');
    if (await isVisible(ownerExistsDropdown, 1000)) return ownerExistsDropdown;

    const addCandidates = [
      this.page.locator(
        'xpath=//h2[normalize-space()="Owner Information"]/ancestor::*[self::div or self::section][1]' +
        '//*[self::a or self::button][normalize-space()="Add"]'
      ).last(),
      this.page.getByRole('link', { name: /^Add$/ }).last(),
      this.page.getByRole('button', { name: /^Add$/ }).last(),
      this.page.locator('a, button').filter({ hasText: /^Add$/ }).last(),
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
      for (const addOwner of addCandidates) {
        if ((await addOwner.count().catch(() => 0)) === 0) continue;
        if (!(await isVisible(addOwner, 3000))) continue;

        logger.info(`Opening Owner Information Add dialog (attempt ${attempt})`);
        await addOwner.scrollIntoViewIfNeeded().catch(() => {});

        try {
          await addOwner.click({ timeout: 10000 });
        } catch (error) {
          logger.warn(`Owner Add click fallback: ${error.message.split('\n')[0]}`);
          await addOwner.evaluate((element) => element.click()).catch(() => {});
        }

        await this.waitForLoad('domcontentloaded');
        if (await isVisible(ownerExistsDropdown, 7000)) return ownerExistsDropdown;
      }

      await this.page.waitForTimeout(1000);
    }

    const pageText = await this.page.locator('main').innerText({ timeout: 5000 }).catch(() => '');
    throw new Error(
      `Owner Information Add dialog did not open. Current URL: ${this.currentUrl()}. ` +
      `Visible page text: ${pageText.slice(0, 500)}`
    );
  }

  async waitForConveyanceRadios(label) {
    const iisPage = this.page.getByRole('link', { name: 'IIS' });
    if (await isVisible(iisPage, 2000)) {
      throw new Error(
        `Server returned an IIS error page instead of the application. ` +
        `Cannot select ${label}. Current URL: ${this.currentUrl()}.`
      );
    }

    const appeared = await this.page.getByRole('radio').first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      throw new Error(
        `Conveyance radio buttons never appeared after selecting ${label}. ` +
        `Current URL: ${this.currentUrl()}.`
      );
    }
  }
}
