import { BasePage } from './BasePage.js';
import { getApplicationTarget } from '../config/runConfig.js';

export class DashboardPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
    this.applyForNewPermitLink  = page.getByText('NPApply for New Permit');
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
        `Current URL: ${this.currentUrl()}. Verify the URL in config/URL.js and server availability.`
      );
    }

    const { application } = getApplicationTarget();
    await this.waitForVisible(this.page.getByRole('radio', { name: application.radio, exact: true }), 150000);
  }
}
