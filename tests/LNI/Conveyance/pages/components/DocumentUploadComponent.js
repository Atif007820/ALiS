import { basename, join } from 'path';
import { BasePage } from '../BasePage.js';
import { TEST_DATA } from '../../config/editableData.js';
import { appConfig, UPLOAD_FILES_DIR } from '../../config/runConfig.js';
import { isVisible } from '../../utils/formActions.js';
import { logger } from '../../utils/logger.js';

export class DocumentUploadComponent extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.mandatoryDocs = page.locator('[id^="mandatoryDoc"][id$="-0"]');
    this.dialog        = page.locator('mat-dialog-container');
  }

  /**
   * Upload a single file via the document upload dialog.
   *
   * @param {{ trigger: import('@playwright/test').Locator, filePath: string, comments: string }} options
   */
  async uploadExistingFile({ trigger, filePath, comments }) {
    await this.waitForVisible(trigger, 150000);
    await trigger.click();

    const dialog = this.dialog.filter({ hasText: 'Document Upload' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 30000 });

    let lastFailure = 'Upload dialog did not close.';
    for (let attempt = 1; attempt <= appConfig.documentUploadRetryLimit; attempt += 1) {
      const fileInput = await this.ensurePendingUploadRow(dialog);
      await fileInput.setInputFiles([]).catch(() => {});
      await fileInput.setInputFiles(filePath);
      await this.verifySelectedFile(fileInput, filePath);

      await dialog.getByRole('textbox', { name: 'comments' }).last().fill(comments);
      await this.page.waitForTimeout(750);
      await dialog.getByRole('button', { name: 'Upload', exact: true }).click();

      const outcome = await this.waitForUploadOutcome(dialog, trigger);
      if (outcome.success) return;

      lastFailure = outcome.message;
      logger.warn(
        `Document upload attempt ${attempt}/${appConfig.documentUploadRetryLimit} failed: ${lastFailure}`,
      );
      if (attempt < appConfig.documentUploadRetryLimit) {
        await this.page.waitForTimeout(1000 * attempt);
      }
    }

    throw new Error(
      `Document upload failed after ${appConfig.documentUploadRetryLimit} attempt(s): ${lastFailure}`,
    );
  }

  async ensurePendingUploadRow(dialog) {
    let fileInput = dialog.locator('input[type="file"]').last();
    if (await fileInput.count().catch(() => 0)) return fileInput;

    const add = dialog.locator('#custom-add1')
      .or(dialog.getByRole('link', { name: 'Add', exact: true }))
      .first();
    await add.click();

    fileInput = dialog.locator('input[type="file"]').last();
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    return fileInput;
  }

  async verifySelectedFile(fileInput, filePath) {
    const expectedName = basename(filePath).toLowerCase();
    const selectedName = await fileInput.evaluate((input) => input.files?.[0]?.name ?? '');
    if (selectedName.toLowerCase() !== expectedName) {
      throw new Error(
        `Document input did not retain the selected file. Expected "${basename(filePath)}", ` +
        `received "${selectedName || 'none'}".`,
      );
    }
  }

  async waitForUploadOutcome(dialog, trigger) {
    const validation = dialog.getByText(/Please select a valid document/i).first();
    const deadline = Date.now() + appConfig.timeouts.documentUploadResult;

    await this.page.waitForTimeout(1500);
    while (Date.now() < deadline) {
      if (!(await dialog.isVisible().catch(() => false))) {
        return { success: true, message: '' };
      }

      const documentCount = await trigger.innerText().catch(() => '');
      if (/Documents\s*\([1-9]\d*\)/i.test(documentCount)) {
        await dialog.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
        await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        return { success: true, message: '' };
      }

      if (await validation.isVisible().catch(() => false)) {
        return { success: false, message: (await validation.innerText()).trim() };
      }

      await this.page.waitForTimeout(500);
    }

    return {
      success: false,
      message: `No success or validation response within ${appConfig.timeouts.documentUploadResult}ms.`,
    };
  }

  /**
   * Iterate all visible mandatory document controls and upload configured files.
   * Throws if no mandatory documents are visible, or if there are more docs than
   * configured upload files.
   *
   * @returns {Promise<number>} Count of documents uploaded.
   */
  async uploadVisibleMandatoryDocuments() {
    await this.waitForVisible(this.mandatoryDocs.first(), 150000);

    const totalDocs = await this.mandatoryDocs.count();
    let uploaded = 0;

    for (let index = 0; index < totalDocs; index++) {
      const trigger = this.mandatoryDocs.nth(index);
      if (!(await isVisible(trigger, 2000))) continue;

      const uploadFile = TEST_DATA.uploadDocuments[uploaded];
      if (!uploadFile) {
        throw new Error('More mandatory documents were found than configured upload files.');
      }

      await this.uploadExistingFile({
        trigger,
        filePath: join(UPLOAD_FILES_DIR, uploadFile.fileName),
        comments: uploadFile.comments,
      });
      uploaded++;
    }

    if (uploaded === 0) {
      throw new Error('No mandatory document upload controls were visible.');
    }

    logger.success(`Uploaded ${uploaded} mandatory document(s).`);
    return uploaded;
  }
}
