/**
 * BasePage
 *
 * All Page Object classes extend this base.
 * It provides shared access to the Playwright `page` object and
 * common navigation / waiting helpers so each page class stays DRY.
 */
export class BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to a URL.
   * @param {string} url
   * @param {import('@playwright/test').GotoOptions} [options]
   */
  async goto(url, options = { waitUntil: 'domcontentloaded' }) {
    await this.page.goto(url, options);
  }

  /**
   * Wait for a locator to become visible.
   * @param {import('@playwright/test').Locator} locator
   * @param {number} [timeout=15000]
   */
  async waitForVisible(locator, timeout = 15000) {
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the page network / DOM to settle.
   * @param {'networkidle'|'domcontentloaded'|'load'} [state='networkidle']
   */
  async waitForLoad(state = 'networkidle') {
    if (this.page?.isClosed?.()) return;
    await this.page.waitForLoadState(state).catch(() => {});
  }

  /**
   * Verify the page is still open and functional.
   * @returns {boolean} `true` if page is open and responsive.
   */
  async isPageOpen() {
    if (this.page?.isClosed?.()) return false;
    try {
      await this.page.evaluate(() => true, { timeout: 2000 }).catch(() => false);
      return !this.page.isClosed();
    } catch {
      return false;
    }
  }

  /**
   * Return the current page URL.
   * @returns {string}
   */
  currentUrl() {
    return this.page.url();
  }
}
