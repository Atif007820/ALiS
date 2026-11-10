import { expect } from '@playwright/test';
import { appConfig } from '../config/runConfig.js';
import { normalizeTransactionNumber } from '../utils/transactionStore.js';
import { BasePage } from './BasePage.js';
import { LoginPage } from './LoginPage.js';

const MANDATORY = { name: /Mandatory Required\b/i, count: 1, status: 'CPT' };
const ADDITIONAL = { name: /Additional Supporting\b/i, count: 1, status: 'WOF' };
const ACCEPTANCE_CHECKLIST = [
  MANDATORY,
  { name: /\(State Only\)\s+Review\b/i, count: 2, status: 'CPT' },
  ADDITIONAL,
  { name: /\(State Only\)\s+Ensure\b/i, count: 1, status: 'CPT' },
];
const APPROVAL_CHECKLIST = [MANDATORY, ADDITIONAL];

export class ApproveApplicationPage extends BasePage {
  constructor(page) {
    super(page);
    this.loginPage = new LoginPage(page);
    this.licensingLink = page.getByRole('link', { name: 'Licensing', exact: true });
    this.workQueueLink = page.getByRole('link', { name: 'Work Queue', exact: true });
    this.transactionField = page.getByRole('textbox', { name: /^Transaction\s*(?:#|Number|No\.?)\s*:?$/i });
    this.searchButton = page.getByRole('button', { name: 'Search', exact: true });
    this.pullLink = page.getByRole('link', { name: /^Pull\s*\|?$/i });
    this.queueRows = page.getByRole('row').filter({
      has: page.getByRole('checkbox'),
    }).filter({ has: page.getByRole('link'), visible: true });
    this.reviewDialog = page.getByRole('dialog')
      .filter({ has: page.getByLabel('Application Status', { exact: true }), visible: true });
  }

  async openWorkQueue(credentials) {
    await this.loginPage.login(credentials, { force: true, landing: this.licensingLink });
    await this.licensingLink.hover();
    await this.workQueueLink.click();
    await expect(this.transactionField).toBeVisible({ timeout: appConfig.timeouts.expect });
    await this.selectQueueFilter({
      label: /^(?:Business Unit|Program|Licensing Program|Board|BU)\s*:?$/i,
      recordedValue: /^(?:Transport Networking Company|Conveyance)$/i,
      attributes: '[id*="businessUnit" i], [name*="businessUnit" i], [id*="ddlBU" i]',
      description: 'business unit',
    }, 'Conveyance');
    await this.selectQueueFilter({
      label: /^(?:Assigned To|Assigned User|Assigned Staff|Assignee|User|Staff)\s*:?$/i,
      recordedValue: /^(?:ADMIN ADMIN|All)$/i,
      attributes: '[id*="assignedTo" i], [name*="assignedTo" i], [id*="assignee" i], [name*="assignee" i]',
      description: 'assignee',
    }, 'All');
  }

  async selectQueueFilter({ label, recordedValue, attributes, description }, value) {
    const fields = this.page.locator('input, select, button, [role="combobox"], [role="textbox"]');
    const candidates = [
      { source: 'associated label', locator: this.page.getByLabel(label).filter({ visible: true }) },
      { source: 'combobox role', locator: this.page.getByRole('combobox', { name: label }).filter({ visible: true }) },
      { source: 'field id/name', locator: this.page.locator(attributes).and(fields).filter({ visible: true }) },
      { source: 'current-value combobox', locator: this.page.getByRole('combobox', { name: recordedValue }).filter({ visible: true }) },
      { source: 'current-value textbox', locator: this.page.getByRole('textbox', { name: recordedValue }).filter({ visible: true }) },
    ];

    const anyCandidate = candidates.map(({ locator }) => locator).reduce((combined, locator) => combined.or(locator));
    await expect(anyCandidate.first(), 'Work Queue must show its ' + description + ' filter')
      .toBeVisible({ timeout: appConfig.timeouts.expect });

    const counts = await Promise.all(candidates.map(async ({ locator }) => locator.count()));
    const selectedIndex = counts.findIndex((count) => count === 1);
    if (selectedIndex < 0) {
      const detail = candidates.map(({ source }, index) => `${source}=${counts[index]}`).join(', ');
      throw new Error(`Could not uniquely identify the Work Queue ${description} filter (${detail}).`);
    }
    const control = candidates[selectedIndex].locator;

    if (await control.evaluate((element) => element.tagName === 'SELECT')) {
      await control.selectOption({ label: value });
      return;
    }

    await control.click();
    await this.page.getByRole('option', { name: value, exact: true }).filter({ visible: true }).click();
  }

  async acceptApplication(application) {
    const entityName = await this.openTransaction(application);
    await this.saveReview(ACCEPTANCE_CHECKLIST, 'ACP');
    return entityName;
  }

  async approveApplication(application) {
    const entityName = await this.openTransaction(application);
    await this.saveReview(APPROVAL_CHECKLIST, 'APR');
    return entityName;
  }

  async openTransaction({ transactionNumber, entityName }) {
    const number = normalizeTransactionNumber(transactionNumber);
    await this.transactionField.fill(number);
    await expect(this.transactionField).toHaveValue(number);
    await this.searchButton.click();

    // Search by the value of the Transaction column only. Matching any text in
    // the row could pull the wrong application when another column repeats it.
    let row = await this.findExactTransactionRow(number);
    const entityLink = await this.getApplicantLink(row, number, entityName);
    await expect(entityLink, 'Expected one applicant link in transaction ' + number)
      .toHaveCount(1, { timeout: appConfig.timeouts.expect });
    const matchedEntityName = (await entityLink.innerText()).trim();
    if (!matchedEntityName) throw new Error('The matched Work Queue application link has no entity name.');

    await row.getByRole('checkbox').check();
    const checkedRows = this.queueRows.filter({ has: this.page.getByRole('checkbox', { checked: true }) });
    await expect(checkedRows, 'Pull must target only the matched application').toHaveCount(1);
    await expect(row.getByRole('checkbox')).toBeChecked();
    await this.pullLink.click();
    const confirmPull = this.page.getByRole('button', { name: 'OK', exact: true }).filter({ visible: true });
    await confirmPull.click();
    await expect(confirmPull).toBeHidden({ timeout: appConfig.timeouts.expect });

    // Pull may redraw or reorder the grid. Re-resolve the same exact transaction
    // before opening it so a stale row position can never select a neighbor.
    row = await this.findExactTransactionRow(number);
    await row.getByRole('link', { name: matchedEntityName, exact: true }).click();
    await expect(this.reviewDialog).toBeVisible({ timeout: appConfig.timeouts.expect });
    return matchedEntityName;
  }

  async findExactTransactionRow(transactionNumber) {
    await expect(this.queueRows.first(), 'The Conveyance Work Queue must return application rows')
      .toBeVisible({ timeout: appConfig.timeouts.expect });

    const inspectRows = async () => {
      const matches = [];
      const count = await this.queueRows.count();

      for (let index = 0; index < count; index += 1) {
        const result = await this.queueRows.nth(index).evaluate((row, expectedNumber) => {
          const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
          const isTransactionHeader = (value) => /^(?:(?:Transaction|TXN)\s*(?:#|Number|No\.?))(?:\s+Filter)?\s*:?$/i.test(normalize(value));
          const table = row.closest('table');
          const grid = row.closest('[role="grid"], [role="treegrid"]');
          let header;
          let cells;

          if (table) {
            let headers = [...table.querySelectorAll('thead th, thead [role="columnheader"]')];
            if (!headers.length) headers = [...table.querySelectorAll('th[scope="col"], [role="columnheader"]')];
            const transactionHeaders = headers.filter((cell) => isTransactionHeader(cell.innerText || cell.textContent));
            if (transactionHeaders.length !== 1) {
              return { error: `Expected one Transaction column header in the result table; found ${transactionHeaders.length}.` };
            }
            header = transactionHeaders[0];
            cells = [...row.children].filter((cell) => /^(TD|TH)$/.test(cell.tagName) || cell.getAttribute('role') === 'gridcell');
          } else if (grid) {
            const transactionHeaders = [...grid.querySelectorAll('[role="columnheader"]')]
              .filter((cell) => isTransactionHeader(cell.innerText || cell.textContent));
            if (transactionHeaders.length !== 1) {
              return { error: `Expected one Transaction column header in the result grid; found ${transactionHeaders.length}.` };
            }
            header = transactionHeaders[0];
            cells = [...row.children].filter((cell) => ['gridcell', 'cell'].includes(cell.getAttribute('role')));
          } else {
            return { error: 'The Work Queue result rows are not inside a table or accessible grid; refusing to guess the transaction column.' };
          }

          const ariaColumn = header.getAttribute('aria-colindex');
          let targetCell;
          if (ariaColumn) {
            targetCell = cells.find((cell) => cell.getAttribute('aria-colindex') === ariaColumn);
          } else {
            const headerRow = header.closest('tr, [role="row"]');
            if (!headerRow) return { error: 'The Transaction column header has no row association.' };
            const headerCells = [...headerRow.children].filter((cell) => (
              /^(TH|TD)$/.test(cell.tagName) || ['columnheader', 'gridcell', 'cell'].includes(cell.getAttribute('role'))
            ));
            let columnIndex = 0;
            for (const cell of headerCells) {
              if (cell === header) break;
              columnIndex += Math.max(1, Number(cell.getAttribute('colspan')) || 1);
            }
            let currentColumn = 0;
            targetCell = cells.find((cell) => {
              const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
              const containsColumn = columnIndex >= currentColumn && columnIndex < currentColumn + span;
              currentColumn += span;
              return containsColumn;
            });
          }

          if (!targetCell) return { error: 'Could not map the Transaction header to a result cell; refusing to guess.' };
          return { value: normalize(targetCell.innerText || targetCell.textContent) === expectedNumber };
        }, transactionNumber);

        if (result.error) throw new Error(result.error);
        if (result.value) matches.push(index);
      }

      return matches;
    };

    await expect.poll(inspectRows, {
      message: 'Expected exactly one Work Queue result in the Transaction column for ' + transactionNumber,
      timeout: appConfig.timeouts.expect,
    }).toHaveLength(1);

    const matches = await inspectRows();
    if (matches.length !== 1) {
      throw new Error(`Expected one Work Queue result for transaction ${transactionNumber}; found ${matches.length}.`);
    }
    return this.queueRows.nth(matches[0]);
  }

  async getApplicantLink(row, transactionNumber, entityName) {
    if (entityName) return row.getByRole('link', { name: entityName, exact: true });

    // Standalone approval has no saved entity name. Accept only a single
    // non-empty link in the already-verified transaction row; ambiguity fails closed.
    const links = row.getByRole('link').filter({ visible: true });
    const candidates = [];
    for (let index = 0; index < await links.count(); index += 1) {
      const label = (await links.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      if (label && label !== transactionNumber) candidates.push(index);
    }

    if (candidates.length !== 1) {
      throw new Error(`Expected one applicant link for transaction ${transactionNumber}; found ${candidates.length}.`);
    }
    return links.nth(candidates[0]);
  }

  async saveReview(checklist, status) {
    const applicationStatus = this.reviewDialog.getByLabel('Application Status', { exact: true });
    const statusOption = applicationStatus.locator('option[value="' + status + '"]');
    await expect(statusOption, 'The current Work Queue stage must offer application status ' + status)
      .toHaveCount(1, { timeout: appConfig.timeouts.expect });

    const selections = [];
    for (const item of checklist) {
      const rows = this.reviewDialog.getByRole('row', { name: item.name }).filter({ visible: true });
      await expect(rows, 'Review checklist row count for ' + item.name)
        .toHaveCount(item.count, { timeout: appConfig.timeouts.expect });
      for (let index = 0; index < item.count; index++) {
        selections.push({ control: rows.nth(index).getByLabel('item-status', { exact: true }), status: item.status });
      }
    }

    for (const selection of selections) await selection.control.selectOption(selection.status);
    await applicationStatus.selectOption(status);
    await expect(applicationStatus).toHaveValue(status);
    for (const selection of selections) await expect(selection.control).toHaveValue(selection.status);

    await this.reviewDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.reviewDialog, 'The review dialog should close after saving application status ' + status)
      .toBeHidden({ timeout: appConfig.timeouts.expect });
  }
}
