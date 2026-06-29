import path from 'node:path';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { click, clickAndWait, fill, firstVisible, waitAfterAction } from '../utils/formActions.js';
import { logger } from '../utils/logger.js';

const MODAL_SELECTORS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.modal.show',
  '.modal-content',
  'cc-document-upload',
  'body',
];

export class DocumentUploadComponent {
  constructor(page) {
    this.page = page;
  }

  async uploadFromLink(linkLocator, filePath, comment = runSettings.uploadComment) {
    await this.closeOpenUploadModals();
    await clickAndWait(this.page, linkLocator, { label: 'Documents link', timeout: 60000 });
    await this.uploadVisibleFile(filePath, comment);
  }

  async uploadVisibleFile(filePath, comment = runSettings.uploadComment) {
    const container = await this.visibleUploadContainer();
    await click(this.page, container.getByRole('link', { name: /^Add$/i }), { label: 'document Add link' });

    const fileChooser = this.page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null);
    const fileButton = container.getByRole('button', { name: /^file$/i }).first();
    if (await fileButton.isVisible().catch(() => false)) {
      await click(this.page, fileButton, { label: 'file button' });
      const chooser = await fileChooser;
      if (chooser) {
        await chooser.setFiles(filePath);
      } else {
        await container.locator('input[type="file"]').last().setInputFiles(filePath);
      }
    } else {
      await container.locator('input[type="file"]').last().setInputFiles(filePath);
    }

    await fill(this.page, container.getByRole('textbox', { name: /comments/i }), comment, { label: 'document comments' });
    await clickAndWait(this.page, container.getByRole('button', { name: /^Upload$/i }), { label: 'Upload button', timeout: 60000 });
    logger.info(`Uploaded document: ${path.basename(filePath)}`);
    await this.closeOpenUploadModals();
  }

  async visibleUploadContainer() {
    return firstVisible(
      MODAL_SELECTORS.map((selector) => this.page.locator(selector).filter({ hasText: /upload|document|file|comments/i })),
      { label: 'document upload container', timeout: 30000 },
    );
  }

  async closeOpenUploadModals() {
    for (const selector of MODAL_SELECTORS.slice(0, -1)) {
      const containers = this.page.locator(selector);
      const count = await containers.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const container = containers.nth(index);
        if (!(await container.isVisible().catch(() => false))) continue;
        const text = await container.innerText().catch(() => '');
        if (!/upload|document|file/i.test(text)) continue;

        const close = container
          .getByRole('button', { name: /^close$|^done$|^ok$|^cancel$/i })
          .or(container.getByRole('link', { name: /^close$/i }))
          .or(container.locator('button[aria-label="Close"], button.close, .btn-close'))
          .first();

        if (await close.isVisible().catch(() => false)) {
          await close.click({ force: true, timeout: 3000 }).catch(() => {});
        } else {
          await this.page.keyboard.press('Escape').catch(() => {});
        }

        await container.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    }
    await waitAfterAction(this.page);
  }
}
