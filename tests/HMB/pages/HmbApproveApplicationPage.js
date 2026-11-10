import { expect } from '@playwright/test';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { HmbLoginApplyPage } from './HmbLoginApplyPage.js';
import { readEntityNames } from '../utils/entityNames.js';
import { normalizeTransactionNumber } from '../utils/transactionStore.js';

const APPROVAL_CHECKLIST = [
  { name: /All Additional Supporting Document\(s\)/i, status: 'CPT' },
  { name: /All Certificate of Incorporation or Articles of Formation/i, status: 'CPT' },
  { name: /All Mandatory Required Document\(s\)/i, status: 'CPT' },
  { name: /All Business Registration Certificate/i, status: 'WOF' },
  { name: /All Certificate of occupancy/i, status: 'CPT' },
  // The supplied steps set item 6 to CPT and then set its StatusCode6 control to WOF.
  // Applying the final recorded value avoids a brittle second selector against a generated ID.
  { name: /All Track Record Review/i, status: 'WOF' },
  // Script 02 only supplies a transaction after its payment step succeeds.
  { name: /All Requisite Fee/i, status: 'CPT' },
];

export class HmbApproveApplicationPage {
  constructor(page) {
    this.page = page;
    this.loginApplyPage = new HmbLoginApplyPage(page);
    this.licensingLink = page.getByRole('link', { name: 'Licensing', exact: true });
    this.workQueueLink = page.getByRole('link', { name: 'Work Queue', exact: true });
    this.transactionField = page.getByRole('textbox', { name: /^Transaction\s*#\s*:?$/i });
    this.searchButton = page.getByRole('button', { name: 'Search', exact: true });
    this.queueRows = page.getByRole('row').filter({ has: page.getByRole('link') }).filter({ visible: true });
    this.reviewDialog = page.getByRole('dialog')
      .filter({ has: page.getByLabel('Application Status', { exact: true }), visible: true });
  }

  async openWorkQueue(credentials) {
    await this.loginApplyPage.login(credentials);
    await expect(this.licensingLink).toBeVisible({ timeout: runSettings.navigationTimeout });
    await this.licensingLink.hover();
    if (!await this.workQueueLink.isVisible().catch(() => false)) {
      await this.licensingLink.click();
    }
    await expect(this.workQueueLink, 'Licensing navigation should expose Work Queue')
      .toBeVisible({ timeout: runSettings.defaultTimeout });
    await this.workQueueLink.click();
    await expect(this.transactionField).toBeVisible({ timeout: runSettings.navigationTimeout });

    await this.selectQueueFilter({
      label: /^(?:Business Unit|Program|Licensing Program|Board|BU)\s*\*?\s*:?$/i,
      initialValue: /^Blood Bank$/i,
      attributes: '[id*="businessUnit" i], [name*="businessUnit" i], [id*="ddlBU" i], [id*="program" i]',
      description: 'HMB business unit',
    }, 'Human Milk Bank');
    await this.selectQueueFilter({
      label: /^(?:Assigned To|Assigned User|Assigned Staff|Assignee|User|Staff)\s*:?$/i,
      initialValue: /^ADMIN ADMIN$/i,
      attributes: '[id*="assignedTo" i], [name*="assignedTo" i], [id*="assignee" i], [name*="assignee" i]',
      description: 'HMB assignee',
    }, 'All');
  }

  async selectQueueFilter({ label, initialValue, attributes, description }, value) {
    const fields = this.page.locator('input, select, button, [role="combobox"], [role="textbox"]');
    const candidates = [
      { source: 'associated label', locator: this.page.getByLabel(label).filter({ visible: true }) },
      { source: 'named combobox', locator: this.page.getByRole('combobox', { name: label }).filter({ visible: true }) },
      { source: 'field id/name', locator: this.page.locator(attributes).and(fields).filter({ visible: true }) },
      { source: 'current-value combobox', locator: this.page.getByRole('combobox', { name: initialValue }).filter({ visible: true }) },
      { source: 'current-value textbox', locator: this.page.getByRole('textbox', { name: initialValue }).filter({ visible: true }) },
    ];
    const visibleCandidates = candidates.map(({ locator }) => locator).reduce((combined, locator) => combined.or(locator));
    await expect(visibleCandidates.first(), `Work Queue must show its ${description} filter`)
      .toBeVisible({ timeout: runSettings.defaultTimeout });

    const counts = await Promise.all(candidates.map(({ locator }) => locator.count()));
    const index = counts.findIndex((count) => count === 1);
    if (index < 0) {
      const detail = candidates.map(({ source }, candidateIndex) => `${source}=${counts[candidateIndex]}`).join(', ');
      throw new Error(`Could not uniquely identify the ${description} filter (${detail}).`);
    }

    const control = candidates[index].locator;
    if (await control.evaluate((element) => element.tagName === 'SELECT')) {
      await control.selectOption({ label: value });
      return;
    }

    await control.click();
    await this.page.getByRole('option', { name: value, exact: true }).filter({ visible: true }).click();
  }

  async approveApplication(application) {
    const row = await this.openTransaction(application);
    await this.reviewChecklist();
    return row.entityName;
  }

  async openTransaction({ transactionNumber, entityName }) {
    const number = normalizeTransactionNumber(transactionNumber);
    await this.transactionField.fill(number);
    await expect(this.transactionField).toHaveValue(number);
    await this.searchButton.click();
    const row = await this.findExactTransactionRow(number);

    let applicantLink;
    if (entityName) {
      applicantLink = row.getByRole('link', { name: entityName, exact: true });
      await expect(applicantLink, `Expected one applicant link for transaction ${number}`)
        .toHaveCount(1, { timeout: runSettings.defaultTimeout });
    } else {
      applicantLink = await this.findStandaloneApplicantLink(row, number);
    }
    const matchedEntityName = (await applicantLink.innerText()).trim();
    if (!matchedEntityName) throw new Error(`Transaction ${number} has an empty applicant link.`);
    await applicantLink.click();
    await expect(this.reviewDialog).toBeVisible({ timeout: runSettings.navigationTimeout });
    return { entityName: matchedEntityName, ...await readEntityNames(this.reviewDialog) };
  }

  async findStandaloneApplicantLink(row, transactionNumber) {
    const nameCellIndex = await row.evaluate((resultRow) => {
      const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
      const table = resultRow.closest('table');
      if (!table) return -1;
      let headers = [...table.querySelectorAll('thead th, thead [role="columnheader"]')];
      if (!headers.length) headers = [...table.querySelectorAll('th[scope="col"], [role="columnheader"]')];
      const nameHeaders = headers.filter((cell) => /^Name(?:\s+Filter)?$/i.test(normalize(cell.innerText || cell.textContent)));
      if (nameHeaders.length !== 1) return -1;

      const header = nameHeaders[0];
      const rowCells = [...resultRow.children]
        .filter((cell) => /^(TD|TH)$/.test(cell.tagName) || cell.getAttribute('role') === 'gridcell');
      const ariaColumn = header.getAttribute('aria-colindex');
      let targetCell;
      if (ariaColumn) {
        targetCell = rowCells.find((cell) => cell.getAttribute('aria-colindex') === ariaColumn);
      } else {
        const headerRow = header.closest('tr, [role="row"]');
        if (!headerRow) return -1;
        const headerCells = [...headerRow.children].filter((cell) => (
          /^(TH|TD)$/.test(cell.tagName) || ['columnheader', 'gridcell', 'cell'].includes(cell.getAttribute('role'))
        ));
        let targetColumn = 0;
        for (const cell of headerCells) {
          if (cell === header) break;
          targetColumn += Math.max(1, Number(cell.getAttribute('colspan')) || 1);
        }
        let currentColumn = 0;
        targetCell = rowCells.find((cell) => {
          const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
          const containsColumn = targetColumn >= currentColumn && targetColumn < currentColumn + span;
          currentColumn += span;
          return containsColumn;
        });
      }
      return targetCell ? rowCells.indexOf(targetCell) : -1;
    });

    if (nameCellIndex < 0) {
      throw new Error(`Could not identify the applicant Name column for transaction ${transactionNumber}.`);
    }
    const cells = row.locator(':scope > td, :scope > th, :scope > [role="gridcell"]');
    const applicantCell = cells.nth(nameCellIndex);
    const applicantLinks = applicantCell.getByRole('link').filter({ visible: true });
    await expect(applicantLinks, `Expected one applicant link in the Name column for transaction ${transactionNumber}`)
      .toHaveCount(1, { timeout: runSettings.defaultTimeout });
    return applicantLinks.first();
  }

  async findExactTransactionRow(transactionNumber) {
    await expect(this.queueRows.first(), 'HMB Work Queue must return application rows')
      .toBeVisible({ timeout: runSettings.defaultTimeout });

    const matchingIndexes = async () => {
      const matches = [];
      for (let index = 0, count = await this.queueRows.count(); index < count; index += 1) {
        const result = await this.queueRows.nth(index).evaluate((row, expected) => {
          const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
          const isTransactionHeader = (value) => /^(?:(?:Transaction|TXN)\s*(?:#|Number|No\.?))(?:\s+Filter)?\s*:?$/i.test(normalize(value));
          const table = row.closest('table');
          const grid = row.closest('[role="grid"], [role="treegrid"]');
          let header;
          let cells;

          if (table) {
            let headers = [...table.querySelectorAll('thead th, thead [role="columnheader"]')];
            if (!headers.length) headers = [...table.querySelectorAll('th[scope="col"], [role="columnheader"]')];
            const matches = headers.filter((cell) => isTransactionHeader(cell.innerText || cell.textContent));
            if (matches.length !== 1) return { error: `Expected one HMB transaction column header; found ${matches.length}.` };
            header = matches[0];
            cells = [...row.children].filter((cell) => /^(TD|TH)$/.test(cell.tagName) || cell.getAttribute('role') === 'gridcell');
          } else if (grid) {
            const matches = [...grid.querySelectorAll('[role="columnheader"]')]
              .filter((cell) => isTransactionHeader(cell.innerText || cell.textContent));
            if (matches.length !== 1) return { error: `Expected one HMB transaction grid header; found ${matches.length}.` };
            header = matches[0];
            cells = [...row.children].filter((cell) => ['gridcell', 'cell'].includes(cell.getAttribute('role')));
          } else {
            return { error: 'HMB result row has no table/grid column metadata; refusing a row-wide transaction match.' };
          }

          const ariaColumn = header.getAttribute('aria-colindex');
          let targetCell;
          if (ariaColumn) {
            targetCell = cells.find((cell) => cell.getAttribute('aria-colindex') === ariaColumn);
          } else {
            const headerRow = header.closest('tr, [role="row"]');
            if (!headerRow) return { error: 'HMB transaction header is not associated with a row.' };
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
          if (!targetCell) return { error: 'Could not map the HMB transaction header to its result cell.' };
          return { matches: normalize(targetCell.innerText || targetCell.textContent) === expected };
        }, transactionNumber);

        if (result.error) throw new Error(result.error);
        if (result.matches) matches.push(index);
      }
      return matches;
    };

    await expect.poll(matchingIndexes, {
      message: `Expected one exact HMB transaction-column match for ${transactionNumber}`,
      timeout: runSettings.defaultTimeout,
    }).toHaveLength(1);
    const matches = await matchingIndexes();
    if (matches.length !== 1) throw new Error(`Expected one HMB row for transaction ${transactionNumber}; found ${matches.length}.`);
    return this.queueRows.nth(matches[0]);
  }

  async reviewChecklist() {
    for (const item of APPROVAL_CHECKLIST) {
      const rows = this.reviewDialog.getByRole('row', { name: item.name }).filter({ visible: true });
      await expect(rows, `Expected one checklist row matching ${item.name}`)
        .toHaveCount(1, { timeout: runSettings.defaultTimeout });
      const status = rows.getByLabel('item-status', { exact: true });
      await status.selectOption(item.status);
      await expect(status).toHaveValue(item.status);
    }

    const checklistRows = this.reviewDialog.getByRole('row')
      .filter({ has: this.page.getByLabel('item-status', { exact: true }), visible: true });
    for (let index = 0, count = await checklistRows.count(); index < count; index += 1) {
      const row = checklistRows.nth(index);
      const status = row.getByLabel('item-status', { exact: true });
      const value = await status.inputValue();
      if (!['CPT', 'WOF'].includes(value)) {
        const description = (await row.innerText()).replace(/\s+/g, ' ').trim().slice(0, 180);
        throw new Error(
          `Cannot set Application Status to APR: checklist row "${description}" remains ${value || 'unset'}. `
          + 'Only Complete (CPT) or Waived off (WOF) checklist rows can be approved.',
        );
      }
    }

    const applicationStatus = this.reviewDialog.getByLabel('Application Status', { exact: true });
    await applicationStatus.selectOption('APR');
    await expect(applicationStatus).toHaveValue('APR');

    const acceptSaveConfirmation = (dialog) => {
      const action = dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss();
      void action.catch(() => {});
    };
    this.page.on('dialog', acceptSaveConfirmation);
    try {
      await this.reviewDialog.getByRole('button', { name: 'Save', exact: true }).click();
      try {
        await expect(this.reviewDialog, 'HMB approval dialog should close after Save')
          .toBeHidden({ timeout: runSettings.navigationTimeout });
      } catch (error) {
        const validationText = (await this.reviewDialog.innerText().catch(() => ''))
          .replace(/\s+/g, ' ').trim().slice(0, 1200);
        throw new Error(`${error.message}\nHMB approval dialog text: ${validationText}`);
      }
    } finally {
      this.page.off('dialog', acceptSaveConfirmation);
    }
  }
}
