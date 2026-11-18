import { expect } from '@playwright/test';
import { APPLICATION_TYPES } from '../config/applicationTypes.js';
import { PermitApplicationPage } from './PermitApplicationPage.js';

export class ConveyanceFollowUpPage extends PermitApplicationPage {
  async selectExistingConveyance(number, appType = 'CV') {
    const application = APPLICATION_TYPES[appType];
    await this.page.getByRole('radio', { name: application.radio, exact: true }).check();
    const input = this.page.getByRole('textbox', { name: 'Conveyance #', exact: true });
    await input.fill(number);
    await input.press('Tab');

    const permit = this.page.getByRole('radio', { name: 'License Type', exact: true }).filter({ visible: true });
    await expect(permit, `Conveyance ${number} must resolve to exactly one eligible permit for ${application.phase}`)
      .toBeVisible();
    await permit.check();
    await expect(permit).toBeChecked();
    await expect(input).toHaveValue(number);
    await this.next();
  }

  async next() {
    // Skip duplicate controls above the active wizard step.
    await this.page.getByRole('button', { name: 'Next', exact: true, disabled: false })
      .filter({ visible: true }).last().click();
  }

  async uploadSupportingDocument(comments) {
    const documents = this.page.getByRole('link', { name: /^Documents\s*\(\s*\d+\s*\)$/i }).filter({ visible: true });
    await this.documents.uploadExistingFile({ trigger: documents, comments });
  }
}
