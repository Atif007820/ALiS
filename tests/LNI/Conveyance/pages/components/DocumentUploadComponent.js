import { basename, join } from 'path';
import { BasePage } from '../BasePage.js';
import { TEST_DATA } from '../../config/editableData.js';
import { appConfig, UPLOAD_FILES_DIR } from '../../config/runConfig.js';
import { logger } from '../../utils/logger.js';

const DOCUMENT_COUNT = /^Documents\s*\(\s*(\d+)\s*\)$/i;
const MISSING_FILE = /Please select file\(s\) for upload/i;
const UPLOAD_REJECTION = /Invalid file format|Please select a valid document|Please select file\(s\) for upload/i;

export class DocumentUploadComponent extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.mandatoryDocs = page.locator(':is(a, button, [role="link"], [role="button"])[id^="mandatoryDoc"]')
      .filter({ hasText: DOCUMENT_COUNT, visible: true });
    this.dialog = page.locator('mat-dialog-container');
  }

  /**
   * Upload a file if the mandatory document row is still empty.
   *
   * @param {{ trigger: import('@playwright/test').Locator, filePath: string, comments: string }} options
   * @returns {Promise<boolean>} Whether this run uploaded a file for the row.
   */
  async uploadExistingFile({ trigger, filePath, comments }) {
    await this.waitForVisible(trigger, 150000);
    const beforeCount = await this.readDocumentCount(trigger);
    if (beforeCount === null) throw new Error('The mandatory document row did not show a unique document count.');
    if (beforeCount > 0) return false;

    const dialog = this.dialog.filter({ hasText: 'Document Upload', visible: true });
    const maxAttempts = appConfig.documentUploadRetryLimit;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (await this.readDocumentCount(trigger) > beforeCount) return true;
      await trigger.click();
      await dialog.waitFor({ state: 'visible', timeout: 30000 });

      const fileInput = await this.ensurePendingUploadRow(dialog);
      await fileInput.setInputFiles(filePath);
      await dialog.getByRole('textbox', { name: 'comments' }).last().fill(comments);
      await this.verifySelectedFile(fileInput, filePath);
      await dialog.getByRole('button', { name: 'Upload', exact: true }).click();

      const outcome = await this.waitForUploadOutcome(dialog, trigger, beforeCount);
      if (outcome.success) {
        await this.closeUploadDialog(dialog);
        return true;
      }
      if (!outcome.retryable || attempt === maxAttempts) {
        throw new Error(`Document upload for "${basename(filePath)}" failed: ${outcome.message}`);
      }

      logger.warn(`Document upload attempt ${attempt} was rejected: ${outcome.message} Retrying the file selection.`);
      await this.closeUploadDialog(dialog);
    }

    throw new Error('Document upload retry limit must be at least 1.');
  }

  async ensurePendingUploadRow(dialog) {
    const fileInput = dialog.locator('input[type="file"]').last();
    if (await fileInput.count()) return fileInput;

    const add = dialog.locator('#custom-add1')
      .or(dialog.getByRole('link', { name: 'Add', exact: true }))
      .first();
    await add.click();
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    return fileInput;
  }

  async verifySelectedFile(fileInput, filePath) {
    const expectedName = basename(filePath);
    const selectedName = await fileInput.evaluate((input) => input.files?.[0]?.name ?? '');
    if (selectedName.toLowerCase() !== expectedName.toLowerCase()) {
      throw new Error(
        `Document input did not retain the selected file. Expected "${expectedName}", ` +
        `received "${selectedName || 'none'}".`,
      );
    }
  }

  async readDocumentCount(trigger) {
    const texts = await trigger.allTextContents();
    const count = texts.length === 1 ? texts[0].trim().match(DOCUMENT_COUNT)?.[1] : undefined;
    return count === undefined ? null : Number(count);
  }

  async waitForUploadOutcome(dialog, trigger, beforeCount) {
    const validation = dialog.getByText(UPLOAD_REJECTION).filter({ visible: true }).first();
    const timeout = appConfig.timeouts.documentUploadResult;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const documentCount = await this.readDocumentCount(trigger);
      if (documentCount > beforeCount) return { success: true };

      if (await validation.isVisible()) {
        const message = (await validation.innerText()).trim();
        return {
          success: false,
          retryable: documentCount === beforeCount && MISSING_FILE.test(message),
          message,
        };
      }
      await this.page.waitForTimeout(250);
    }

    return {
      success: false,
      retryable: false,
      message: `Document count did not increase within ${timeout}ms. The upload result is unconfirmed.`,
    };
  }

  async closeUploadDialog(dialog) {
    if (!(await dialog.isVisible())) return;
    try {
      await dialog.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 2000 });
    } catch (error) {
      if (await dialog.isVisible()) throw error;
    }
    await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /**
   * Verify every visible mandatory document row and upload its configured file if needed.
   *
   * @returns {Promise<number>} Count of new uploads.
   */
  async uploadVisibleMandatoryDocuments() {
    await this.waitForVisible(this.mandatoryDocs.first(), 150000);
    const rowIds = await this.mandatoryDocs.evaluateAll((elements) => elements.map((element) => element.id));
    if (!rowIds.length) throw new Error('No mandatory document upload controls were visible.');
    if (rowIds.length > TEST_DATA.uploadDocuments.length) {
      throw new Error('More mandatory documents were found than configured upload files.');
    }
    let uploaded = 0;

    for (const [index, id] of rowIds.entries()) {
      const trigger = this.mandatoryDocs.and(this.page.locator(`[id=${JSON.stringify(id)}]`));
      const uploadFile = TEST_DATA.uploadDocuments[index];
      const didUpload = await this.uploadExistingFile({
        trigger,
        filePath: join(UPLOAD_FILES_DIR, uploadFile.fileName),
        comments: uploadFile.comments,
      });
      if (didUpload) uploaded++;
    }

    logger.success(`Verified ${rowIds.length} mandatory document row(s), with ${uploaded} new upload(s).`);
    return uploaded;
  }
}
