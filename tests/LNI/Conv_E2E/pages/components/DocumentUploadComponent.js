import { join } from 'path';
import { BasePage } from '../BasePage.js';
import { TEST_DATA } from '../../config/editableData.js';
import { UPLOAD_FILES_DIR } from '../../config/runConfig.js';
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

    await this.page.locator('#custom-add1').first().click();
    await this.dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    await this.page.getByRole('textbox', { name: 'comments' }).fill(comments);
    await this.page.getByRole('button', { name: 'Upload' }).click();
    await this.dialog.waitFor({ state: 'hidden', timeout: 150000 });
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
