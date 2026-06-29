import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';

export class NjStrategy extends BaseStrategy {
  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();

    const productTab = product.tabSelector
      ? this.page.locator(product.tabSelector)
      : this.page.getByText(product.portalText, { exact: true });

    await this.form.click(productTab);
    await this.form.waitForLoginShell();
    await this.form.click(this.page.getByRole('link', { name: /^Click Here$/i }).first());

    await expect(this.page.locator('body')).toContainText(/Initial User Registration/i, { timeout: 30000 });
    await expect(this.page.getByRole('textbox', { name: product.entityFields[0] })).toBeVisible({ timeout: 30000 });
  }

  async fillRegistration(product, user) {
    for (const fieldName of product.entityFields) {
      const filled = await this.form.fillByTableLabel(fieldName, user.entityName, { required: false });
      if (!filled) {
        await this.form.fillFirstText([fieldName], user.entityName, { hard: true, required: true });
      }
    }

    await this.form.fillByTableLabel(/^Last Name\b/i, user.lastName, { required: true });
    await this.form.fillByTableLabel(/^First Name\b/i, user.firstName, { required: true });
    await this.form.fillByTableLabel(/^Email ID\b/i, user.emailId, { required: true });
    await this.form.fillAddress(user);
  }

  async shouldRetryWhenFormStillOpen() {
    return false;
  }
}
