import { BasePage } from './BasePage.js';

export class DashboardPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.applyForNewPermitLink  = page.getByText('NPApply for New Permit');
    this.newConveyanceRadio     = page.getByRole('radio', { name: 'New Conveyance Installation' });
  }

  /**
   * Click "Apply for New Permit" and wait for the conveyance selection screen.
   * Throws a descriptive error if the server returns an IIS error page.
   */
  async openNewPermitApplication() {
    await this.waitForVisible(this.applyForNewPermitLink, 150000);
    await this.applyForNewPermitLink.click();

    const iisIndicator = this.page.getByRole('link', { name: 'IIS' });
    if (await iisIndicator.isVisible().catch(() => false)) {
      throw new Error(
        `Navigation after "Apply for New Permit" landed on an IIS default/error page. ` +
        `Current URL: ${this.currentUrl()}. Verify BASE_URL in config/editableData.js and server availability.`
      );
    }

    await this.waitForVisible(this.newConveyanceRadio, 150000);
  }
}
