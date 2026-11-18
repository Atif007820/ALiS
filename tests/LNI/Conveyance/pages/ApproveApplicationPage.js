import { expect } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { appConfig } from '../config/runConfig.js';
import { APPLICATION_TYPES, getFollowUpType } from '../config/applicationTypes.js';
import { logger } from '../utils/logger.js';
import { normalizeConveyanceNumber, normalizeTransactionNumber } from '../utils/transactionStore.js';
import { BasePage } from './BasePage.js';
import { LoginPage } from './LoginPage.js';

const CHECKLIST_OUTCOMES = Object.freeze({ CPT: 'Complete', WOF: 'Waived Off' });
const MANDATORY = { name: /Mandatory Required\b/i, count: 1 };
const ADDITIONAL = { name: /Additional Supporting\b/i, count: 1 };
const CONTRACT_REVIEW = { name: /\bReview\s+copy\s+of\s+contract\b/i, count: 1 };
const FEE_REVIEW = { name: /\bReview\s+Application\s+Fee\b/i, count: 1 };
const PAYMENT_LINK = { name: /\bEnsure\s+payment\s+linked\s+to\s+permit\b/i, count: 1 };
const OPTIONAL_FEE_PAYMENT = [FEE_REVIEW, PAYMENT_LINK].map(item => ({ ...item, optional: true }));
const ACCEPTANCE_CHECKLIST = [
  MANDATORY,
  CONTRACT_REVIEW,
  ADDITIONAL,
  ...OPTIONAL_FEE_PAYMENT,
];
const APPROVAL_CHECKLIST = [
  MANDATORY,
  ADDITIONAL,
  ...OPTIONAL_FEE_PAYMENT,
  { name: /\bVerify\s+Blind\s+Hoistway\b/i, count: 1, optional: true },
];
const HOIST_ACCEPTANCE_CHECKLIST = [ADDITIONAL, FEE_REVIEW, PAYMENT_LINK];
const HOIST_APPROVAL_CHECKLIST = [ADDITIONAL, ...OPTIONAL_FEE_PAYMENT];
const VARIANCE_MANDATORY = { ...MANDATORY, name: /Mandatory Required Documents?\b/i };
const VARIANCE_ACCEPTANCE_CHECKLIST = [
  PAYMENT_LINK,
  ADDITIONAL,
  FEE_REVIEW,
  VARIANCE_MANDATORY,
];
const VARIANCE_APPROVAL_CHECKLIST = [ADDITIONAL, VARIANCE_MANDATORY];
const ALTERATION_ACCEPTANCE_CHECKLIST = [PAYMENT_LINK, ADDITIONAL, FEE_REVIEW];
const ALTERATION_APPROVAL_CHECKLIST = [
  { ...ADDITIONAL, optional: true },
  { ...VARIANCE_MANDATORY, optional: true },
];
const CHECKLISTS = {
  NCI: [ACCEPTANCE_CHECKLIST, APPROVAL_CHECKLIST],
  CHI: [HOIST_ACCEPTANCE_CHECKLIST, HOIST_APPROVAL_CHECKLIST],
  CV: [VARIANCE_ACCEPTANCE_CHECKLIST, VARIANCE_APPROVAL_CHECKLIST],
  CA: [ALTERATION_ACCEPTANCE_CHECKLIST, ALTERATION_APPROVAL_CHECKLIST],
};
const TRANSACTION_COLUMN = /^(?:Transaction|TXN)\s*(?:#|Number|No\.?)(?:\s+Filter)?\s*:?$/i;
const CONVEYANCE_COLUMN = /^Conveyance\s*(?:#|Number|No\.?)(?:\s+Filter)?\s*:?$/i;
const ASSIGNEE_COLUMN = /^(?:Assigned Staff|Assigned To|Assignee)(?:\s+Filter)?$/i;
const APPLICATION_COLUMN = /^Application Type(?:\s+Filter)?$/i;
const BUILDING_OFFICIAL = /\bApproval\s+by\s+(?:the\s+)?Building\s+Official\b/i;
const SAVE_VALIDATION = /please review (?:the )?following errors|validation failed/i;
const ALREADY_ASSIGNED = /^Please select task\(s\) not assigned to you\.?$/i;
const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function chooseChecklistStatus(enabledOptions, pickIndex = randomInt) {
  const allowed = Object.keys(CHECKLIST_OUTCOMES).filter(status => enabledOptions.includes(status));
  return allowed.length > 1 ? allowed[pickIndex(allowed.length)] : allowed[0];
}

export class ApproveApplicationPage extends BasePage {
  constructor(page, { pickIndex = randomInt } = {}) {
    super(page);
    this.pickIndex = pickIndex;
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
    const welcome = this.page.getByText(/^Welcome\s+\S/i).filter({ visible: true });
    const welcomeText = await welcome.allInnerTexts();
    this.reviewerName = welcomeText.length === 1 ? normalize(welcomeText[0].replace(/^\s*Welcome\s+/i, '')) : '';
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
    const [checklist] = CHECKLISTS[application.appType ?? 'NCI'];
    await this.saveReview(application, checklist, 'ACP');
    return entityName;
  }

  async approveApplication(application, { captureConveyanceNumber = false } = {}) {
    let conveyanceNumber;
    const entityName = await this.openTransaction(application, captureConveyanceNumber ? async row => {
      conveyanceNumber = await this.readQueueColumn(row, CONVEYANCE_COLUMN);
    } : undefined);
    const [, checklist] = CHECKLISTS[application.appType ?? 'NCI'];
    await this.saveReview(application, checklist, 'APR');
    if (!captureConveyanceNumber) return entityName;
    if (!/^\d+$/.test(conveyanceNumber)) {
      // Some builds only assign the number after APR. Search the exact transaction again.
      await this.searchButton.click();
      const row = await this.findExactTransactionRow(application.transactionNumber);
      conveyanceNumber = await this.readQueueColumn(row, CONVEYANCE_COLUMN);
    }
    return normalizeConveyanceNumber(conveyanceNumber);
  }

  async approveExistingTransaction(transactionNumber) {
    const number = normalizeTransactionNumber(transactionNumber);
    const row = await this.searchTransactionRow(number);
    const label = await this.readQueueColumn(row, APPLICATION_COLUMN);
    const match = Object.entries(APPLICATION_TYPES).find(([key, type]) =>
      normalize(key) === normalize(label) || normalize(type.label) === normalize(label)
      || (type.radio instanceof RegExp && type.radio.test(label)));
    if (!match || !CHECKLISTS[match[0]]) {
      throw new Error(`Unsupported Work Queue application type "${label}" for transaction ${number}; approval was not attempted.`);
    }
    const [appType, type] = match;
    const conveyanceNumber = await this.readQueueColumn(row, CONVEYANCE_COLUMN, { optional: true });
    const application = { transactionNumber: number, appType,
      conveyanceNumber: /^\d+$/.test(conveyanceNumber) ? conveyanceNumber : undefined };
    const entityName = await this.openTransactionRow(row, application);
    const status = this.reviewDialog.getByLabel('Application Status', { exact: true });
    await expect(status, 'The current review status must be available').not.toHaveValue('');
    const current = await status.inputValue();
    if (current === 'APR') return { ...application, applicationType: type.label, entityName, alreadyApproved: true };

    const [acceptance, approval] = CHECKLISTS[appType];
    if (current === 'ACP') {
      await this.saveReview(application, approval, 'APR');
    } else if (['PEN', 'UDR'].includes(current)) {
      await this.saveReview(application, acceptance, 'ACP');
      await this.approveApplication({ ...application, entityName });
    } else {
      throw new Error(`Transaction ${number} has review status "${current}"; approval requires pending, administrative review or technical review.`);
    }
    return { ...application, applicationType: type.label, entityName };
  }

  async searchTransactionRow(transactionNumber) {
    const number = normalizeTransactionNumber(transactionNumber);
    await this.transactionField.fill(number);
    await expect(this.transactionField).toHaveValue(number);
    await this.searchButton.click();

    // Search by the value of the Transaction column only. Matching any text in
    // the row could pull the wrong application when another column repeats it.
    return this.findExactTransactionRow(number);
  }

  async openTransaction(application, inspectRow) {
    const row = await this.searchTransactionRow(application.transactionNumber);
    return this.openTransactionRow(row, application, inspectRow);
  }

  async openTransactionRow(row, { transactionNumber: number, entityName, conveyanceNumber, appType }, inspectRow) {
    if (conveyanceNumber && await this.readQueueColumn(row, CONVEYANCE_COLUMN) !== conveyanceNumber) {
      throw new Error(`Transaction ${number} does not belong to conveyance ${conveyanceNumber}.`);
    }
    const expected = getFollowUpType(appType);
    if (expected) {
      const actual = await this.readQueueColumn(row, APPLICATION_COLUMN);
      if (![normalize(expected.label), normalize(appType)].includes(normalize(actual))) {
        throw new Error(`Transaction ${number} is "${actual}", not "${expected.label}". Check the flow or AppType before approving.`);
      }
    }
    const entityLink = await this.getApplicantLink(row, number, entityName, conveyanceNumber);
    await expect(entityLink, 'Expected one applicant link in transaction ' + number)
      .toHaveCount(1, { timeout: appConfig.timeouts.expect });
    const matchedEntityName = (await entityLink.innerText()).trim();
    if (!matchedEntityName) throw new Error('The matched Work Queue application link has no entity name.');

    const assignee = this.reviewerName ? normalize(await this.readQueueColumn(row, ASSIGNEE_COLUMN, { optional: true })) : '';
    if (!assignee || assignee !== this.reviewerName) {
      await this.pullTransaction(row);
      // Pull can reorder the grid, so resolve the exact transaction again.
      row = await this.findExactTransactionRow(number);
    }
    await inspectRow?.(row);
    await row.getByRole('link', { name: matchedEntityName, exact: true }).click();
    await expect(this.reviewDialog).toBeVisible({ timeout: appConfig.timeouts.expect });
    return matchedEntityName;
  }

  async pullTransaction(row) {
    const checkbox = row.getByRole('checkbox');
    await checkbox.check();
    const checkedRows = this.queueRows.filter({ has: this.page.getByRole('checkbox', { checked: true }) });
    await expect(checkedRows, 'Pull must target only the matched application').toHaveCount(1);
    await expect(checkbox).toBeChecked();
    await this.pullLink.click();
    const confirmPull = this.page.getByRole('button', { name: 'OK', exact: true }).filter({ visible: true });
    const alreadyAssigned = this.page.getByText(ALREADY_ASSIGNED).filter({ visible: true });
    await expect(confirmPull.or(alreadyAssigned).first(), 'Work Queue must confirm Pull or report that the task is already assigned')
      .toBeVisible({ timeout: appConfig.timeouts.action });
    if (await alreadyAssigned.isVisible()) {
      if (await checkbox.isChecked()) await checkbox.uncheck();
      return;
    }
    await confirmPull.click();
    await expect(confirmPull).toBeHidden({ timeout: appConfig.timeouts.expect });
  }

  async findExactTransactionRow(transactionNumber) {
    await expect(this.queueRows.first(), 'The Conveyance Work Queue must return application rows')
      .toBeVisible({ timeout: appConfig.timeouts.expect });

    const inspectRows = async () => {
      const matches = [];
      const count = await this.queueRows.count();

      for (let index = 0; index < count; index += 1) {
        const value = await this.readQueueColumn(this.queueRows.nth(index), TRANSACTION_COLUMN);
        if (value === transactionNumber) matches.push(index);
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

  async readQueueColumn(row, column, { optional = false } = {}) {
    const result = await row.evaluate((row, { source, flags, optional }) => {
      const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
      const pattern = new RegExp(source, flags);
      const table = row.closest('table');
      const grid = row.closest('[role="grid"], [role="treegrid"]');
      if (!table && !grid) return { error: 'The result row is not inside a table or accessible grid.' };

      const container = table ?? grid;
      const primaryHeaders = table ? [...table.querySelectorAll('thead th, thead [role="columnheader"]')] : [];
      const headers = primaryHeaders.length ? primaryHeaders : [...container.querySelectorAll('th[scope="col"], [role="columnheader"]')];
      const matches = headers.filter(cell => {
        const labels = [...cell.querySelectorAll('button, [role="button"]')]
          .flatMap(button => [button.getAttribute('aria-label'), button.textContent]);
        return [cell.innerText, cell.textContent, ...labels].some(value => pattern.test(clean(value)));
      });
      if (!matches.length && optional) return { value: '' };
      if (matches.length !== 1) return { error: `Expected one matching column header; found ${matches.length}.` };

      const [header] = matches;
      const cells = [...row.children].filter(cell => cell.matches('td, th, [role="gridcell"], [role="cell"]'));
      const ariaColumn = header.getAttribute('aria-colindex');
      let targetCell;
      if (ariaColumn) {
        targetCell = cells.find(cell => cell.getAttribute('aria-colindex') === ariaColumn);
      } else {
        const headerRow = header.closest('tr, [role="row"]');
        if (!headerRow) return { error: 'The column header has no row association.' };
        const headerCells = [...headerRow.children].filter(cell => cell.matches('th, td, [role="columnheader"], [role="gridcell"], [role="cell"]'));
        const span = cell => Math.max(1, Number(cell.getAttribute('colspan')) || 1);
        const position = headerCells.indexOf(header);
        if (position < 0) return { error: 'Could not locate the header inside its row.' };
        const columnIndex = headerCells.slice(0, position).reduce((index, cell) => index + span(cell), 0);
        let currentColumn = 0;
        targetCell = cells.find(cell => {
          currentColumn += span(cell);
          return currentColumn > columnIndex;
        });
      }

      if (!targetCell) return { error: 'Could not map the header to the result cell.' };
      return { value: clean(targetCell.innerText || targetCell.textContent) };
    }, { source: column.source, flags: column.flags, optional });
    if (result.error) throw new Error(`Work Queue column ${column}: ${result.error}`);
    return result.value;
  }

  async getApplicantLink(row, transactionNumber, entityName, conveyanceNumber) {
    if (entityName) return row.getByRole('link', { name: entityName, exact: true });

    // A reused applicant may have no saved entity name. Accept only a single
    // non-empty link in the already-verified transaction row; ambiguity fails closed.
    const links = row.getByRole('link').filter({ visible: true });
    const candidates = [];
    for (let index = 0; index < await links.count(); index += 1) {
      const label = (await links.nth(index).innerText()).replace(/\s+/g, ' ').trim();
      if (label && label !== transactionNumber && label !== conveyanceNumber) candidates.push(index);
    }

    if (candidates.length !== 1) {
      throw new Error(`Expected one applicant link for transaction ${transactionNumber}; found ${candidates.length}.`);
    }
    return links.nth(candidates[0]);
  }

  async unresolvedChecklistItems() {
    const controls = this.reviewDialog.getByLabel('item-status', { exact: true }).filter({ visible: true });
    return controls.evaluateAll((fields, resolved) => fields
      .filter(field => !resolved.includes(field.value))
      .map(field => {
        const row = field.closest('tr, [role="row"]');
        const label = [...(row?.querySelectorAll('td, [role="cell"], [role="gridcell"]') ?? [])]
          .filter(cell => !cell.contains(field))
          .map(cell => cell.innerText.replace(/\s+/g, ' ').trim())
          .filter(Boolean).join(' ');
        return `${label || 'Unnamed checklist item'} (${field.selectedOptions?.[0]?.textContent.trim() || 'unset'})`;
      }), Object.keys(CHECKLIST_OUTCOMES));
  }

  async waiveNonApplicableBuildingApproval(application) {
    const rows = this.reviewDialog.getByRole('row', { name: BUILDING_OFFICIAL }).filter({ visible: true });
    if (!(await rows.count())) return;
    await expect(rows, 'Expected one Building Official approval checklist row').toHaveCount(1);
    const control = rows.getByLabel('item-status', { exact: true });
    if (!(await control.count())) return;
    const value = await control.inputValue();
    if (Object.hasOwn(CHECKLIST_OUTCOMES, value)) return;
    if (value !== 'PEN' || !/^(?:no|n\s*\/?\s*a|not applicable)$/i.test(String(application.existingBuildingAnswer ?? '').trim())) {
      return;
    }
    await control.selectOption('WOF');
    await expect(control, 'Building Official approval is not applicable to this installation').toHaveValue('WOF');
  }

  async readSaveValidation(validation) {
    const details = await validation.evaluate(banner => {
      const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      const dialog = banner.closest('[role="dialog"]');
      for (let region = banner; region && region !== dialog; region = region.parentElement) {
        const messages = [...region.querySelectorAll('li')].filter(visible);
        if (messages.length) return messages.map(item => item.innerText);
      }
      return [];
    });
    const errors = await this.reviewDialog.locator('[role="alert"], .validation-summary-errors, .field-validation-error, mat-error')
      .filter({ visible: true }).allInnerTexts();
    return [...new Set([await validation.innerText(), ...details, ...errors]
      .map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  }

  async saveReview(application, checklist, status) {
    const applicationStatus = this.reviewDialog.getByLabel('Application Status', { exact: true });
    const statusOption = applicationStatus.locator('option[value="' + status + '"]');
    await expect(statusOption, 'The current Work Queue stage must offer application status ' + status)
      .toHaveCount(1, { timeout: appConfig.timeouts.expect });

    const selections = [];
    for (const item of checklist) {
      const rows = this.reviewDialog.getByRole('row', { name: item.name }).filter({ visible: true });
      if (item.optional && await rows.count() === 0) continue;
      await expect(rows, 'Review checklist row count for ' + item.name)
        .toHaveCount(item.count, { timeout: appConfig.timeouts.expect });
      for (let index = 0; index < item.count; index++) {
        const row = rows.nth(index);
        const control = row.getByLabel('item-status', { exact: true });
        const enabledOptions = await control.locator('option:enabled').evaluateAll(options => options.map(option => option.value));
        const selected = chooseChecklistStatus(enabledOptions, this.pickIndex);
        if (!selected) throw new Error(`No allowed checklist status is enabled for ${item.name} on transaction ${application.transactionNumber}.`);
        logger.info(`Checklist ${item.name}: selected ${CHECKLIST_OUTCOMES[selected]}.`);
        selections.push({ control, status: selected });
      }
    }

    for (const selection of selections) await selection.control.selectOption(selection.status);
    await applicationStatus.selectOption(status);
    await expect(applicationStatus).toHaveValue(status);
    for (const selection of selections) await expect(selection.control).toHaveValue(selection.status);

    if (application.appType === 'NCI' && application.perType === 'Comm') {
      await this.waiveNonApplicableBuildingApproval(application);
    }
    const pending = await this.unresolvedChecklistItems();
    if (pending.length) {
      throw new Error(`Transaction ${application.transactionNumber} has unresolved approval checklist items for status ${status}: ${pending.join(' | ')}.`);
    }

    await this.reviewDialog.getByRole('button', { name: 'Save', exact: true }).click();
    const validation = this.reviewDialog.getByText(SAVE_VALIDATION).filter({ visible: true }).first();
    let message;
    await expect.poll(async () => {
      if (!await this.reviewDialog.isVisible()) return 'closed';
      if (!await validation.isVisible()) return 'waiting';
      message = await this.readSaveValidation(validation);
      return 'rejected';
    }, {
      message: `ALiS must finish saving status ${status} for transaction ${application.transactionNumber}`,
      timeout: appConfig.timeouts.expect,
    }).not.toBe('waiting');
    if (message) {
      throw new Error(`ALiS rejected status ${status} for transaction ${application.transactionNumber}: ${message.join(' | ')}`);
    }
  }
}
