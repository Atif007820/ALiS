import { expect } from '@playwright/test';
import { join } from 'node:path';
import { APPLICATION_TYPES } from '../config/applicationTypes.js';
import { TEST_DATA } from '../config/editableData.js';
import { UPLOAD_FILES_DIR } from '../config/runConfig.js';
import { randomEnglishName } from '../utils/randomData.js';
import { normalizeConveyanceNumber } from '../utils/transactionStore.js';
import { PermitApplicationPage } from './PermitApplicationPage.js';

const details = TEST_DATA.variance;

export class ConveyanceVariancePage extends PermitApplicationPage {
  async completeVarianceApplication(conveyanceNumber) {
    const number = normalizeConveyanceNumber(conveyanceNumber);
    await this.selectExistingConveyance(number);

    await expect(this.page.getByRole('heading', { name: 'Entity Information', exact: true })).toBeVisible();
    await this.next();

    const permitMailing = this.page.locator('#ddlCopy_LMA').filter({ visible: true });
    await permitMailing.selectOption(TEST_DATA.lmaCopySource);
    await this.page.getByRole('textbox', { name: 'Contact Person', exact: true })
      .filter({ visible: true }).fill(randomEnglishName());
    await this.next();

    const documents = this.page.getByRole('link', { name: /^Documents\s*\(\s*\d+\s*\)$/i }).filter({ visible: true });
    await this.documents.uploadExistingFile({
      trigger: documents,
      filePath: join(UPLOAD_FILES_DIR, details.document.fileName),
      comments: details.document.comments,
    });
    await this.next();
    await this.answerVarianceQuestions();
    await this.attestSubmitAndPayLater();
    await this.expectConfirmation();
    return { appType: 'CV', conveyanceNumber: number };
  }

  async selectExistingConveyance(number) {
    await this.page.getByRole('radio', { name: APPLICATION_TYPES.CV.radio, exact: true }).check();
    const input = this.page.getByRole('textbox', { name: 'Conveyance #', exact: true });
    await input.fill(number);
    await input.press('Tab');

    const permit = this.page.getByRole('radio', { name: 'License Type', exact: true }).filter({ visible: true });
    await expect(permit, `Conveyance ${number} must resolve to exactly one eligible permit for variance`)
      .toBeVisible();
    await permit.check();
    await expect(permit).toBeChecked();
    await expect(input).toHaveValue(number);
    await this.next();
  }

  async next() {
    // The wizard repeats its Next control; use the enabled bottom action, not a fixed index.
    await this.page.getByRole('button', { name: 'Next', exact: true, disabled: false })
      .filter({ visible: true }).last().click();
  }

  async answerVarianceQuestions() {
    const questions = this.page.locator('.question-item').filter({ visible: true });
    await expect(questions.first(), 'CV review questions must be visible').toBeVisible();
    const answerRules = new Map(Object.entries(details.radioAnswers).map(([question, answer]) => [this.normalizeText(question), answer]));
    const writtenAnswers = [
      [/^Variance Justification:/i, details.justification],
      [/^Variance Description:/i, details.description],
    ];
    const filled = new Set();

    for (const question of await questions.all()) {
      const text = await this.getQuestionText(question);
      if (await question.getByRole('radio').count()) {
        const answer = answerRules.get(this.normalizeText(text));
        if (!answer || !await this.checkQuestionRadioAnswer(question, answer)) {
          throw new Error(`No configured CV answer could be selected for "${text}". Check variance.radioAnswers in config/editableData.js.`);
        }
        continue;
      }
      const answerField = question.getByRole('textbox', { name: 'Answer', exact: true }).filter({ visible: true });
      if (!await answerField.count()) continue;
      const rule = writtenAnswers.find(([pattern]) => pattern.test(text));
      if (!rule || !String(rule[1] ?? '').trim() || filled.has(rule)) {
        throw new Error(`No unique configured CV text answer for "${text}". Check variance in config/editableData.js.`);
      }
      await answerField.fill(rule[1]);
      await expect(answerField).toHaveValue(rule[1]);
      filled.add(rule);
    }
    if (filled.size !== writtenAnswers.length) throw new Error('CV review did not show both Variance Justification and Variance Description fields.');
  }
}
