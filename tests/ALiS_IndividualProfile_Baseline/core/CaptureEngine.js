import { baselineConfig } from '../config/baseline.config.js';
import { editableData } from '../config/editableData.js';
import { normalizeText, uniqueBy } from './text.js';
import {
  numberWithDigitLength,
  phone,
  pick,
  simplePerson,
} from '../utils/randomData.js';
import { runUiActions } from '../utils/uiActions.js';
import { ensurePageOpen, waitForPageTimeout } from '../utils/pageGuards.js';

export class CaptureEngine {
  constructor(config = baselineConfig.capture) {
    this.config = config;
    this.warnings = [];
    this.completedTablePreconditions = new Set();
    this.unavailableSections = new Set();
    this.reportedWarnings = new Set();
  }

  async captureTabs(page) {
    const texts = await this.collectVisibleTexts(page, this.config.tabSelectors);
    return uniqueBy(texts, (text) => text).filter(Boolean);
  }

  async captureSectionHeaders(page) {
    const ignored = new Set((this.config.ignoredSectionHeaders || []).map(normalizeText));
    const texts = await this.collectVisibleTexts(page, this.config.sectionHeaderSelectors);

    return uniqueBy(texts, (text) => text).filter((text) => {
      if (!text || ignored.has(text)) {
        return false;
      }

      return !this.shouldIgnoreCapturedText(text, 'sectionHeader');
    });
  }

  async captureSectionHeadersByTab(page, tabNames, { businessUnit } = {}) {
    const tabs = this.detailTabs(
      tabNames?.length ? tabNames : await this.captureTabs(page),
      businessUnit,
    );

    if (!tabs.length) {
      const headers = await this.captureSectionHeaders(page);
      return headers.map((header) => ({
        'Section Header': header,
        'Parent Tab': '',
      }));
    }

    const rows = [];

    for (const tabName of tabs) {
      await this.prepareTabForCapture(page, tabName);
      await this.ensureSectionHeaderPreconditions(page, tabName);

      const headers = await this.captureSectionHeaders(page);
      for (const header of headers) {
        rows.push({
          'Section Header': header,
          'Parent Tab': tabName,
        });
      }
    }

    return uniqueBy(rows, (row) => `${row['Section Header']} | ${row['Parent Tab']}`);
  }

  async ensureSectionHeaderPreconditions(page, tabName) {
    if (normalizeText(tabName).toLowerCase() !== 'additional information') {
      return;
    }

    await this.ensureAdditionalContactHeaders(page);
  }

  async captureFieldLabelsByTab(page, tabNames, { expectedRows = [], businessUnit } = {}) {
    const tabs = this.detailTabs(
      tabNames?.length ? tabNames : await this.captureTabs(page),
      businessUnit,
    );

    if (!tabs.length) {
      return this.captureFieldLabels(page, '');
    }

    const rows = [];

    for (const tabName of tabs) {
      await this.prepareTabForCapture(page, tabName);
      const tabRows = await this.captureFieldLabelsForPreparedTab(page, tabName, expectedRows, businessUnit);
      rows.push(...tabRows);
    }

    return uniqueBy(
      rows,
      (row) => `${row['Field Label']} | ${row['Parent Tab']} | ${row['Section Header']}`,
    );
  }

  async captureTableColumnHeadersByTab(page, tabNames, {
    expectedRows = [],
    businessUnit,
    runPreconditions = true,
  } = {}) {
    const tabs = this.detailTabs(
      tabNames?.length ? tabNames : await this.captureTabs(page),
      businessUnit,
    );

    if (!tabs.length) {
      return this.captureTableColumnHeaders(page, '');
    }

    const rows = [];

    for (const tabName of tabs) {
      await this.prepareTabForCapture(page, tabName);
      const tabRows = await this.captureTableColumnHeadersForPreparedTab(
        page,
        tabName,
        expectedRows,
        businessUnit,
        { runPreconditions },
      );
      rows.push(...tabRows);
    }

    return uniqueBy(
      rows,
      (row) => `${row['Column Header']} | ${row['Section Header']} | ${row['Parent Tab']}`,
    );
  }

  async captureInformativeTextByTab(page, tabNames, { expectedRows = [], businessUnit } = {}) {
    const ignoredInformativeTextPatterns = this.informativeTextIgnorePatterns(businessUnit);
    const tabs = this.detailTabs(
      tabNames?.length ? tabNames : await this.captureTabs(page),
      businessUnit,
    );
    const expectedTabs = new Set(
      expectedRows
        .map((row) => normalizeText(row['Parent Tab']).toLowerCase())
        .filter(Boolean),
    );
    const tabsToCapture = expectedTabs.size
      ? tabs.filter((tabName) => expectedTabs.has(normalizeText(tabName).toLowerCase()))
      : tabs;

    if (!tabsToCapture.length) {
      return this.captureInformativeText(page, '', {
        expectedRows,
        ignoredInformativeTextPatterns,
      });
    }

    const rows = [];

    for (const tabName of tabsToCapture) {
      await this.prepareTabForCapture(page, tabName);
      const tabRows = await this.captureRowsForPreparedTabWithRetry(page, tabName, {
        expectedRows,
        keyColumns: ['Text', 'Section Header', 'Parent Tab'],
        capture: () => this.captureInformativeText(page, tabName, {
          expectedRows: this.expectedRowsForTab(expectedRows, tabName),
          ignoredInformativeTextPatterns,
        }),
      });
      rows.push(...tabRows);
    }

    return uniqueBy(
      rows,
      (row) => `${row.Text} | ${row['Section Header']} | ${row['Parent Tab']}`,
    );
  }

  async captureSnapshotByTab(page, tabNames, {
    includeSectionHeaders = true,
    includeFieldLabels = true,
    includeTableColumnHeaders = true,
    includeInformativeText = false,
    runTableHeaderPreconditions = true,
    fieldExpectedRows = [],
    tableExpectedRows = [],
    informativeTextExpectedRows = [],
    businessUnit,
  } = {}) {
    const ignoredInformativeTextPatterns = this.informativeTextIgnorePatterns(businessUnit);
    const tabs = this.detailTabs(
      tabNames?.length ? tabNames : await this.captureTabs(page),
      businessUnit,
    );
    const snapshot = {
      tabs,
      sectionHeaderRows: [],
      fieldLabelRows: [],
      tableColumnHeaderRows: [],
      informativeTextRows: [],
    };

    if (!tabs.length) {
      await this.settleCurrentTabForCapture(page);
      if (includeInformativeText) {
        snapshot.informativeTextRows = await this.captureInformativeText(page, '', {
          expectedRows: informativeTextExpectedRows,
          ignoredInformativeTextPatterns,
        });
      }

      if (includeSectionHeaders) {
        snapshot.sectionHeaderRows = (await this.captureSectionHeaders(page)).map((header) => ({
          'Section Header': header,
          'Parent Tab': '',
        }));
      }

      if (includeFieldLabels) {
        snapshot.fieldLabelRows = await this.captureFieldLabels(page, '');
      }

      if (includeTableColumnHeaders) {
        snapshot.tableColumnHeaderRows = await this.captureTableColumnHeaders(page, '');
      }

      return snapshot;
    }

    for (const tabName of tabs) {
      await this.prepareTabForCapture(page, tabName);

      const informativeRowsForTab = this.expectedRowsForTab(informativeTextExpectedRows, tabName);
      const shouldCaptureInformativeText = includeInformativeText && (
        !informativeTextExpectedRows.length
        || informativeRowsForTab.length > 0
      );

      if (shouldCaptureInformativeText) {
        const informativeRows = await this.captureRowsForPreparedTabWithRetry(page, tabName, {
          expectedRows: informativeTextExpectedRows,
          keyColumns: ['Text', 'Section Header', 'Parent Tab'],
          capture: () => this.captureInformativeText(page, tabName, {
            expectedRows: informativeRowsForTab,
            ignoredInformativeTextPatterns,
          }),
        });
        snapshot.informativeTextRows.push(...informativeRows);
      }

      if (includeSectionHeaders) {
        await this.ensureSectionHeaderPreconditions(page, tabName);
        const headers = await this.captureSectionHeaders(page);
        for (const header of headers) {
          if (this.shouldIgnoreCapturedText(header, 'sectionHeader')) {
            continue;
          }

          snapshot.sectionHeaderRows.push({
            'Section Header': header,
            'Parent Tab': tabName,
          });
        }
      }

      if (includeFieldLabels) {
        const fieldRows = await this.captureFieldLabelsForPreparedTab(page, tabName, fieldExpectedRows, businessUnit);
        snapshot.fieldLabelRows.push(...fieldRows);
      }

      if (includeTableColumnHeaders) {
        const tableRows = await this.captureTableColumnHeadersForPreparedTab(
          page,
          tabName,
          tableExpectedRows,
          businessUnit,
          { runPreconditions: runTableHeaderPreconditions },
        );
        snapshot.tableColumnHeaderRows.push(...tableRows);
      }
    }

    snapshot.sectionHeaderRows = uniqueBy(
      snapshot.sectionHeaderRows,
      (row) => `${row['Section Header']} | ${row['Parent Tab']}`,
    );
    snapshot.fieldLabelRows = uniqueBy(
      snapshot.fieldLabelRows,
      (row) => `${row['Field Label']} | ${row['Parent Tab']} | ${row['Section Header']}`,
    );
    snapshot.tableColumnHeaderRows = uniqueBy(
      snapshot.tableColumnHeaderRows,
      (row) => `${row['Column Header']} | ${row['Section Header']} | ${row['Parent Tab']}`,
    );
    snapshot.informativeTextRows = uniqueBy(
      snapshot.informativeTextRows,
      (row) => `${row.Text} | ${row['Section Header']} | ${row['Parent Tab']}`,
    );

    return snapshot;
  }

  detailTabs(tabNames, businessUnit) {
    const skippedTabs = new Set(
      (businessUnit?.skippedDetailTabs || [])
        .map((tabName) => normalizeText(tabName).toLowerCase())
        .filter(Boolean),
    );

    const includeAdditionalInformation = this.config.enableAdditionalInformationTab !== false
      && businessUnit?.enableAdditionalInformationTab !== false;

    const filteredTabs = tabNames.filter((tabName) => {
      const normalizedTab = normalizeText(tabName).toLowerCase();
      if (skippedTabs.has(normalizedTab)) {
        return false;
      }

      if (!includeAdditionalInformation && normalizedTab === 'additional information') {
        return false;
      }

      return true;
    });

    return filteredTabs;
  }

  shouldIgnoreCapturedText(text, type = 'fieldLabel') {
    const normalized = normalizeText(text);
    if (!normalized) {
      return false;
    }

    if (this.matchesConfiguredPattern(normalized, 'pageHeadingPatterns')) {
      return true;
    }

    if (type === 'fieldLabel' && this.matchesConfiguredPattern(normalized, 'fieldLabelMetadataPatterns')) {
      return true;
    }

    if (type === 'fieldLabel' && /:\s*/.test(normalized)) {
      return true;
    }

    return false;
  }

  matchesConfiguredPattern(text, configKey) {
    return (this.config[configKey] || [])
      .map((pattern) => String(pattern || '').trim())
      .filter(Boolean)
      .some((pattern) => new RegExp(pattern, 'i').test(text));
  }

  informativeTextIgnorePatterns(businessUnit) {
    return uniqueBy(
      [
        ...(this.config.ignoredInformativeTextPatterns || []),
        ...(businessUnit?.ignoredInformativeTextPatterns || []),
      ]
        .map((pattern) => String(pattern || '').trim())
        .filter(Boolean),
      (pattern) => pattern,
    );
  }

  async captureFieldLabelsForPreparedTab(page, tabName, expectedRows = [], businessUnit) {
    const keyColumns = ['Field Label', 'Parent Tab', 'Section Header'];
    const tabExpectedRows = this.expectedRowsForTab(expectedRows, tabName);
    const tabExpectedKeys = new Set(tabExpectedRows.map((row) => this.rowKey(row, keyColumns)));
    const requiredFieldOverrides = this.requiredFieldOverridesForTab(businessUnit, tabName);

    return this.captureRowsForPreparedTabWithRetry(page, tabName, {
      expectedRows,
      keyColumns,
      capture: async () => {
        const primaryRows = await this.captureFieldLabels(page, tabName, {
          expectedRows: tabExpectedRows,
          requiredFieldOverrides,
        });

        if (!tabExpectedKeys.size || this.countMatchingRows(primaryRows, tabExpectedKeys, keyColumns) >= tabExpectedKeys.size) {
          return primaryRows;
        }

        const fallbackRows = await this.captureFieldLabels(page, tabName, {
          includeControlFallback: true,
          expectedRows: tabExpectedRows,
          requiredFieldOverrides,
        });
        const expectedFallbackRows = fallbackRows.filter((row) => tabExpectedKeys.has(this.rowKey(row, keyColumns)));

        return uniqueBy(
          [...primaryRows, ...expectedFallbackRows],
          (row) => this.rowKey(row, keyColumns),
        );
      },
    });
  }

  async captureTableColumnHeadersForPreparedTab(
    page,
    tabName,
    expectedRows = [],
    businessUnit,
    { runPreconditions = true } = {},
  ) {
    return this.captureRowsForPreparedTabWithRetry(page, tabName, {
      expectedRows,
      keyColumns: ['Column Header', 'Section Header', 'Parent Tab'],
      precondition: runPreconditions
        ? () => this.ensureTableHeaderPreconditions(page, tabName, businessUnit, expectedRows)
        : undefined,
      capture: async () => this.reconcileTableHeaderSections(
        await this.captureTableColumnHeaders(page, tabName),
        this.expectedRowsForTab(expectedRows, tabName),
      ),
    });
  }

  reconcileTableHeaderSections(rows, expectedRows) {
    if (!expectedRows.length) {
      return rows;
    }

    const expectedSectionsByHeaderAndOrder = new Map();
    for (const row of expectedRows) {
      const key = this.tableHeaderAndOrderKey(row);
      const sections = expectedSectionsByHeaderAndOrder.get(key) || new Set();
      sections.add(normalizeText(row['Section Header']));
      expectedSectionsByHeaderAndOrder.set(key, sections);
    }

    return rows
      .map((row) => {
        if (normalizeText(row['Section Header'])) {
          return row;
        }

        const sections = expectedSectionsByHeaderAndOrder.get(this.tableHeaderAndOrderKey(row));
        if (!sections?.size) {
          return null;
        }

        if (sections.size !== 1) {
          return row;
        }

        return {
          ...row,
          'Section Header': [...sections][0],
        };
      })
      .filter(Boolean);
  }

  tableHeaderAndOrderKey(row) {
    return [
      normalizeText(row['Column Header']),
      normalizeText(row['Column Order']),
    ].join(' | ');
  }

  async captureRowsForTabWithRetry(page, tabName, {
    expectedRows = [],
    keyColumns = [],
    precondition,
    capture,
  }) {
    await this.prepareTabForCapture(page, tabName);

    return this.captureRowsForPreparedTabWithRetry(page, tabName, {
      expectedRows,
      keyColumns,
      precondition,
      capture,
    });
  }

  async captureRowsForPreparedTabWithRetry(page, tabName, {
    expectedRows = [],
    keyColumns = [],
    precondition,
    capture,
  }) {
    const expectedForTab = this.expectedRowsForTab(expectedRows, tabName);
    const expectedKeys = new Set(expectedForTab.map((row) => this.rowKey(row, keyColumns)));
    const attempts = expectedKeys.size
      ? baselineConfig.timeouts.captureRetryAttempts
      : 1;
    const delayMs = baselineConfig.timeouts.captureRetryDelayMs;
    let bestRows = [];
    let bestMatchCount = -1;
    let lastSignature = '';
    let stableMatches = 0;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) {
        await waitForPageTimeout(page, delayMs, 'capture retry delay');
        await this.settleCurrentTabForCapture(page);
      }

      if (precondition) {
        await precondition();
      }

      const rows = await capture();
      const matchCount = this.countMatchingRows(rows, expectedKeys, keyColumns);
      const signature = rows.map((row) => this.rowKey(row, keyColumns)).sort().join('\n');

      if (matchCount > bestMatchCount || (matchCount === bestMatchCount && rows.length > bestRows.length)) {
        bestRows = rows;
        bestMatchCount = matchCount;
      }

      if (!expectedKeys.size) {
        return rows;
      }

      if (matchCount >= expectedKeys.size) {
        return rows;
      }

      if (
        attempt === 1 &&
        await this.expectedSectionsUnavailableAfterFirstCapture(page, tabName, expectedForTab, rows)
      ) {
        break;
      }

      if (signature === lastSignature) {
        stableMatches += 1;
      } else {
        stableMatches = 0;
        lastSignature = signature;
      }

      if (stableMatches >= 2 && rows.length > 0) {
        break;
      }

    }

    if (expectedKeys.size && bestMatchCount < expectedKeys.size) {
      this.warnings.push(
        `${tabName}: captured ${Math.max(bestMatchCount, 0)} of ${expectedKeys.size} expected rows after retrying lazy content.`,
      );
    }

    return bestRows;
  }

  expectedRowsForTab(rows, tabName) {
    const normalizedTabName = normalizeText(tabName).toLowerCase();

    return rows.filter((row) => normalizeText(row['Parent Tab']).toLowerCase() === normalizedTabName);
  }

  countMatchingRows(rows, expectedKeys, keyColumns) {
    if (!expectedKeys.size) {
      return rows.length;
    }

    return rows.filter((row) => expectedKeys.has(this.rowKey(row, keyColumns))).length;
  }

  rowKey(row, columns) {
    return columns.map((column) => normalizeText(row[column]).replace(/\s*:\s*$/, '')).join(' | ');
  }

  requiredFieldOverridesForTab(businessUnit, tabName) {
    const normalizedTabName = normalizeText(tabName).toLowerCase();
    const overrides = businessUnit?.requiredFieldOverrides || [];

    return overrides
      .filter((override) => {
        const overrideTab = normalizeText(override.parentTab || override.tabName || '').toLowerCase();
        return !overrideTab || overrideTab === normalizedTabName;
      })
      .map((override) => ({
        fieldLabel: normalizeText(override.fieldLabel || override.label),
        sectionHeader: normalizeText(override.sectionHeader || ''),
        required: normalizeText(override.required ?? override.value ?? 'Yes') || 'Yes',
      }))
      .filter((override) => override.fieldLabel);
  }

  async expectedSectionsUnavailableAfterFirstCapture(page, tabName, expectedRows, capturedRows) {
    const expectedSections = this.expectedSectionNames(expectedRows);

    if (!expectedSections.length) {
      return false;
    }

    const capturedSectionKeys = new Set(
      capturedRows
        .map((row) => this.sectionNameKey(row['Section Header']))
        .filter(Boolean),
    );

    if (expectedSections.some((section) => capturedSectionKeys.has(section.key))) {
      return false;
    }

    const visibleSections = await this.visibleExpectedSections(page, expectedSections);
    if (visibleSections.length) {
      return false;
    }

    for (const section of expectedSections) {
      this.markSectionUnavailable(tabName, section.text);
    }

    this.warnOnce(
      `capture-retry-skip:${this.sectionNameKey(tabName)}:${expectedSections.map((section) => section.key).join('|')}`,
      `${tabName}: expected section(s) not visible after first capture; skipped repeated lazy retries for ${expectedSections.map((section) => `"${section.text}"`).join(', ')}.`,
    );

    return true;
  }

  expectedSectionNames(rows) {
    const sections = rows
      .map((row) => normalizeText(row['Section Header']))
      .filter(Boolean);

    return uniqueBy(sections, (section) => this.sectionNameKey(section))
      .map((text) => ({
        text,
        key: this.sectionNameKey(text),
      }));
  }

  async visibleExpectedSections(page, expectedSections) {
    const expectedKeys = expectedSections.map((section) => section.key);

    return page.evaluate((keys) => {
      function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function sectionKey(value) {
        return cleanText(value).toLowerCase();
      }

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      const wanted = new Set(keys);
      return Array.from(document.body?.querySelectorAll('*') || [])
        .filter(isVisible)
        .map((element) => sectionKey(element.textContent))
        .filter((text) => wanted.has(text));
    }, expectedKeys).catch(() => []);
  }

  sectionNameKey(value) {
    return normalizeText(value).toLowerCase();
  }

  sectionAvailabilityKey(tabName, sectionName) {
    return `${this.sectionNameKey(tabName)} | ${this.sectionNameKey(sectionName)}`;
  }

  markSectionUnavailable(tabName, sectionName) {
    this.unavailableSections.add(this.sectionAvailabilityKey(tabName, sectionName));
  }

  isSectionUnavailable(tabName, sectionName) {
    return this.unavailableSections.has(this.sectionAvailabilityKey(tabName, sectionName));
  }

  warnOnce(key, message) {
    if (this.reportedWarnings.has(key)) {
      return;
    }

    this.reportedWarnings.add(key);
    this.warnings.push(message);
  }

  async prepareTabForCapture(page, tabName) {
    await this.clickTab(page, tabName);
    await this.settleCurrentTabForCapture(page);
  }

  async settleCurrentTabForCapture(page) {
    await this.waitForCaptureReady(page);
    await this.revealLazyContent(page);
    await this.waitForDomStable(page);
  }

  async waitForCaptureReady(page) {
    ensurePageOpen(page, 'capture readiness wait');
    await waitForPageTimeout(page, baselineConfig.timeouts.tabClickStabilizeMs, 'tab click stabilization');
    await page.waitForLoadState('domcontentloaded', { timeout: baselineConfig.timeouts.navigationMs }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: baselineConfig.timeouts.captureNetworkIdleMs }).catch(() => {});
    await this.waitForAngularStable(page);
    await this.waitForBusyIndicatorsToSettle(page);
    await waitForPageTimeout(page, baselineConfig.timeouts.captureStabilizeMs, 'capture stabilization');
  }

  async waitForAngularStable(page) {
    await page.evaluate((timeoutMs) => new Promise((resolve) => {
      const testabilities = window.getAllAngularTestabilities?.();
      if (!testabilities?.length) {
        resolve();
        return;
      }

      let remaining = testabilities.length;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      };

      for (const testability of testabilities) {
        testability.whenStable(done);
      }

      setTimeout(resolve, timeoutMs);
    }), baselineConfig.timeouts.angularStableMs).catch(() => {});
  }

  async waitForBusyIndicatorsToSettle(page) {
    const busySelector = [
      '.loading',
      '.loader',
      '.spinner',
      '.ngx-spinner',
      '.ngx-overlay',
      '.block-ui-wrapper',
      '.k-loading-mask',
      '[aria-busy="true"]',
    ].join(',');

    await page.locator(busySelector).first().waitFor({
      state: 'hidden',
      timeout: baselineConfig.timeouts.busyIndicatorMs,
    }).catch(() => {});
  }

  async revealLazyContent(page) {
    await page.evaluate(() => {
      const scrollTargets = [
        document.querySelector('[role="main"]'),
        document.querySelector('.tab-content'),
        document.scrollingElement,
        document.documentElement,
        document.body,
      ].filter(Boolean);

      for (const target of scrollTargets) {
        target.scrollTop = 0;
      }

      const lazyContainers = Array.from(document.querySelectorAll('table, [role="grid"], [role="table"]'));
      for (const element of lazyContainers) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
      }

      for (const target of scrollTargets) {
        target.scrollTop = 0;
      }
    }).catch(() => {});
  }

  async waitForDomStable(page) {
    const requiredStableChecks = baselineConfig.timeouts.domStableChecks;
    let stableChecks = 0;
    let lastSnapshot = '';

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const snapshot = await page.evaluate(() => {
        function isVisible(element) {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        }

        return JSON.stringify({
          textLength: document.body?.innerText?.length || 0,
          tables: Array.from(document.querySelectorAll('table, [role="grid"], [role="table"]')).filter(isVisible).length,
          labels: Array.from(document.querySelectorAll('label, [aria-label], input, select, textarea')).filter(isVisible).length,
        });
      }).catch(() => '');

      if (snapshot === lastSnapshot) {
        stableChecks += 1;
        if (stableChecks >= requiredStableChecks) {
          return;
        }
      } else {
        stableChecks = 0;
        lastSnapshot = snapshot;
      }

      await waitForPageTimeout(page, baselineConfig.timeouts.domStablePollMs, 'DOM stability polling');
    }
  }

  async ensureTableHeaderPreconditions(page, tabName, businessUnit, expectedRows = []) {
    if (await this.waitForExpectedTableHeaders(page, tabName, expectedRows)) {
      return;
    }

    const configuredPrecondition = this.tableHeaderPreconditionForTab(businessUnit, tabName);
    if (configuredPrecondition) {
      await this.runConfiguredTableHeaderPrecondition(page, tabName, businessUnit, configuredPrecondition);
      return;
    }

    if (normalizeText(tabName).toLowerCase() !== 'additional information') {
      return;
    }

    await this.ensureAdditionalContactHeaders(page);
  }

  async waitForExpectedTableHeaders(page, tabName, expectedRows) {
    const expectedForTab = this.expectedRowsForTab(expectedRows, tabName);
    if (!expectedForTab.length) {
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await this.expectedTableHeadersPresent(page, tabName, expectedRows)) {
        return true;
      }

      if (attempt < 3) {
        await waitForPageTimeout(page, 400, 'waiting for existing table headers');
        await this.settleCurrentTabForCapture(page);
      }
    }

    return false;
  }

  async expectedTableHeadersPresent(page, tabName, expectedRows) {
    const expectedForTab = this.expectedRowsForTab(expectedRows, tabName);

    if (!expectedForTab.length) {
      return false;
    }

    const expectedKeys = new Set(
      expectedForTab.map((row) => this.rowKey(row, ['Column Header', 'Section Header', 'Parent Tab'])),
    );
    const rows = await this.captureTableColumnHeaders(page, tabName);
    return this.countMatchingRows(rows, expectedKeys, ['Column Header', 'Section Header', 'Parent Tab']) >= expectedKeys.size;
  }

  tableHeaderPreconditionForTab(businessUnit, tabName) {
    const preconditions = businessUnit?.tableHeaderPreconditions || {};
    const normalizedTabName = normalizeText(tabName).toLowerCase();

    return Object.entries(preconditions)
      .find(([key]) => normalizeText(key).toLowerCase() === normalizedTabName)?.[1] || null;
  }

  async runConfiguredTableHeaderPrecondition(page, tabName, businessUnit, precondition) {
    const key = `${businessUnit?.id || 'BU'} | ${tabName} | ${precondition.name || 'table-precondition'}`;

    if (this.completedTablePreconditions.has(key)) {
      return;
    }

    this.completedTablePreconditions.add(key);
    await runUiActions(page, precondition.actions || [], {
      businessUnit,
      tabName,
    });
    await this.settleCurrentTabForCapture(page);
  }

  async ensureAdditionalContactHeaders(page) {
    const tabName = 'Additional Information';
    const sectionName = 'Additional Contacts Information';

    if (this.isSectionUnavailable(tabName, sectionName)) {
      return;
    }

    const section = page.getByText('Additional Contacts Information', { exact: true }).first();
    const sectionVisible = await section
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!sectionVisible) {
      this.markSectionUnavailable(tabName, sectionName);
      this.warnOnce(
        `section-not-visible:${this.sectionAvailabilityKey(tabName, sectionName)}`,
        'Additional Contacts Information section was not visible on Additional Information tab.',
      );
      return;
    }

    if (await this.hasAdditionalContactHeaders(page)) {
      return;
    }

    await this.addAdditionalContact(page);

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      if (await this.hasAdditionalContactHeaders(page)) {
        return;
      }

      await waitForPageTimeout(page, 500, 'waiting for Additional Contacts headers');
    }

    this.warnings.push('Additional Contacts Information headers were still not visible after adding a contact.');
  }

  async hasAdditionalContactHeaders(page) {
    return page.evaluate(() => {
      const scope = document.querySelector('app-profile-owners-info') || document.body;
      const expectedHeaders = ['Name', 'Role', 'Primary Email', 'Primary Phone'];

      function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      const headerTexts = Array.from(scope.querySelectorAll('th, [role="columnheader"], .gridhd'))
        .filter(isVisible)
        .map((element) => cleanText(element.getAttribute('aria-label') || element.textContent))
        .filter(Boolean);

      return expectedHeaders.every((header) => headerTexts.includes(header));
    }).catch(() => false);
  }

  async addAdditionalContact(page) {
    const contact = this.buildAdditionalContactData();
    const ownerSection = page.locator('app-profile-owners-info').first();
    const addLink = ownerSection.getByRole('link', { name: /^Add$/i })
      .or(page.locator('#custom-add0'))
      .or(page.getByRole('link', { name: /^Add$/i }))
      .first();

    if (!(await this.clickIfVisible(addLink))) {
      this.warnings.push('Could not click Additional Contacts Information Add link.');
      return;
    }

    await waitForPageTimeout(page, 500, 'Additional Contact form opening');
    await this.fillTextbox(page, 'Last Name', contact.lastName);
    await this.fillTextbox(page, 'First Name', contact.firstName);
    await this.checkCheckbox(page, 'Person in Charge');
    await this.checkCheckbox(page, 'Director');
    await this.checkCheckbox(page, 'Administrator');
    await this.fillTextbox(page, 'Address', contact.address);
    await this.fillTextbox(page, 'City', contact.city);
    await this.selectByLabel(page, 'State/Province', contact.state);
    await this.fillTextbox(page, 'Primary Phone #', contact.phone, { exact: true });
    await this.fillTextbox(page, 'Primary E-mail', contact.email);
    await this.fillTextbox(page, 'Alternate E-mail', contact.altEmail);

    const saveButton = page.getByRole('button', { name: /^Save$/i }).first();
    if (!(await this.clickIfVisible(saveButton))) {
      this.warnings.push('Could not click Save after filling Additional Contacts Information.');
      return;
    }

    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await waitForPageTimeout(page, baselineConfig.timeouts.captureStabilizeMs, 'Additional Contact save stabilization');
  }

  buildAdditionalContactData() {
    const person = simplePerson(editableData.testData);
    const city = pick(editableData.testData.cities);
    const streetName = pick(editableData.testData.streetNames);

    return {
      firstName: person.firstName,
      lastName: person.lastName,
      address: `${numberWithDigitLength(3)} ${streetName} Street`,
      city,
      state: pick(editableData.testData.usStates),
      phone: phone(),
      email: editableData.testData.primaryEmail,
      altEmail: editableData.testData.alternateEmail,
    };
  }

  async fillTextbox(page, name, value, { exact = false } = {}) {
    const textbox = page.getByRole('textbox', { name, exact }).first();
    const visible = await textbox
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!visible) {
      this.warnings.push(`Additional contact field was not visible: ${name}`);
      return false;
    }

    await textbox.fill(value);
    return true;
  }

  async checkCheckbox(page, name) {
    const checkbox = page.getByRole('checkbox', { name }).first();
    const visible = await checkbox
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    if (!visible) {
      this.warnings.push(`Additional contact checkbox was not visible: ${name}`);
      return false;
    }

    await checkbox.check();
    return true;
  }

  async selectByLabel(page, label, value) {
    const select = page.getByLabel(label).first();
    const visible = await select
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!visible) {
      this.warnings.push(`Additional contact dropdown was not visible: ${label}`);
      return false;
    }

    await select.selectOption(value);
    return true;
  }

  async captureTableColumnHeaders(page, parentTab = '') {
    const options = {
      tableSelectors: this.config.tableSelectors || ['table'],
      sectionHeaderSelectors: this.config.sectionHeaderSelectors || [],
      ignoredSectionHeaders: this.config.ignoredSectionHeaders || [],
      parentTab,
    };

    return page.$$eval(options.tableSelectors.join(','), (tables, captureOptions) => {
      function cleanText(value) {
        return String(value || '')
          .replace(/\*/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*:\s*$/, '')
          .trim();
      }

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function isRendered(element) {
        const style = window.getComputedStyle(element);
        return style.visibility !== 'hidden' && style.display !== 'none';
      }

      function matchesAny(element, selectors) {
        return selectors.some((selector) => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        });
      }

      function textFromElement(element) {
        if (!element) {
          return '';
        }

        const clone = element.cloneNode(true);
        if (typeof clone.querySelectorAll === 'function') {
          clone.querySelectorAll('input, select, textarea, option, script, style').forEach((node) => {
            node.remove();
          });
        }

        return cleanText(clone.textContent || '');
      }

      const visibleElements = Array.from(document.querySelectorAll('body *')).filter(isVisible);
      const order = new Map(visibleElements.map((element, index) => [element, index]));
      const ignoredSectionHeaders = new Set(
        captureOptions.ignoredSectionHeaders.map((text) => cleanText(text)),
      );
      const sectionHeaders = visibleElements
        .filter((element) => matchesAny(element, captureOptions.sectionHeaderSelectors))
        .map((element) => ({
          index: order.get(element),
          text: textFromElement(element),
        }))
        .filter((section) => section.text && !ignoredSectionHeaders.has(section.text));

      function findSectionHeader(element) {
        const index = order.get(element) ?? 0;
        const previousSections = sectionHeaders.filter((section) => section.index < index);
        return previousSections.length ? previousSections[previousSections.length - 1].text : '';
      }

      function headerCandidateRows(table) {
        const allRows = Array.from(table.querySelectorAll('tr')).filter(isVisible);
        const candidates = [];

        candidates.push(...Array.from(table.querySelectorAll('thead tr')).filter(isVisible));
        candidates.push(...allRows.filter((row) => row.querySelector('th, [role="columnheader"]')));

        if (!candidates.length) {
          const firstTextOnlyRow = allRows.find((row) => {
            const cells = visibleCells(row);
            if (cells.length < 2) return false;

            return cells.every((cell) => (
              textFromElement(cell) &&
              !cell.querySelector('input, select, textarea, option')
            ));
          });

          if (firstTextOnlyRow) candidates.push(firstTextOnlyRow);
        }

        return candidates;
      }

      function visibleCells(row) {
        return Array.from(row.children)
          .filter((cell) => ['TH', 'TD'].includes(cell.tagName) || cell.getAttribute('role') === 'columnheader')
          .filter(isRendered);
      }

      function headerTextFromCell(cell) {
        const gridHeader = cell.querySelector('.gridhd, button[aria-label]');
        const gridHeaderText = cleanText(
          gridHeader?.getAttribute('aria-label') || gridHeader?.textContent || '',
        );

        if (gridHeaderText) {
          return gridHeaderText;
        }

        const ariaText = cleanText(cell.getAttribute('aria-label') || '');
        if (ariaText) {
          return ariaText;
        }

        return textFromElement(cell);
      }

      function headersFromRow(row) {
        return visibleCells(row)
          .map((cell) => headerTextFromCell(cell))
          .filter((text) => text && text.length <= 80 && !isIgnoredColumnHeader(text));
      }

      function isIgnoredColumnHeader(text) {
        return /^header value not available$/i.test(text);
      }

      const rows = [];
      tables
        .filter(isVisible)
        .forEach((table) => {
          const headerRow = headerCandidateRows(table)[0];
          if (!headerRow) return;

          const headers = headersFromRow(headerRow);
          if (headers.length < 2) return;
          const sectionHeader = findSectionHeader(table);

          headers.forEach((header, index) => {
            rows.push({
              'Column Header': header,
              'Column Order': String(index + 1),
              'Section Header': sectionHeader,
              'Parent Tab': captureOptions.parentTab,
            });
          });
        });

      return rows;
    }, options);
  }

  async captureInformativeText(
    page,
    parentTab = '',
    { expectedRows = [], ignoredInformativeTextPatterns = [] } = {},
  ) {
    const options = {
      sectionHeaderSelectors: this.config.sectionHeaderSelectors || [],
      ignoredSectionHeaders: this.config.ignoredSectionHeaders || [],
      ignoredInformativeTextPatterns,
      parentTab,
      expectedRows,
    };

    return page.$$eval('body *', (elements, captureOptions) => {
      function cleanText(value) {
        return String(value || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function key(value) {
        return cleanText(value).toLowerCase();
      }

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function matchesAny(element, selectors) {
        return selectors.some((selector) => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        });
      }

      function colorChannels(element) {
        const color = window.getComputedStyle(element).color || '';
        const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        return match
          ? match.slice(1, 4).map(Number)
          : [0, 0, 0];
      }

      function isRedText(element) {
        const [red, green, blue] = colorChannels(element);
        return red >= 140
          && red >= green + 45
          && red >= blue + 45;
      }

      function textFromElement(element) {
        const clone = element.cloneNode(true);
        if (typeof clone.querySelectorAll === 'function') {
          clone.querySelectorAll('br').forEach((node) => node.replaceWith(' '));
          clone.querySelectorAll(
            'input, select, textarea, option, button, script, style, svg, [aria-hidden="true"]',
          ).forEach((node) => node.remove());
        }

        return cleanText(clone.textContent || '');
      }

      function hasRedParent(element) {
        const parent = element.parentElement;
        return Boolean(parent && isVisible(parent) && isRedText(parent));
      }

      function depth(element) {
        let value = 0;
        let current = element;
        while (current?.parentElement) {
          value += 1;
          current = current.parentElement;
        }
        return value;
      }

      const visibleElements = elements.filter(isVisible);
      const order = new Map(visibleElements.map((element, index) => [element, index]));
      const ignoredHeaders = new Set(
        captureOptions.ignoredSectionHeaders.map((header) => key(header)),
      );
      const sectionHeaders = visibleElements
        .filter((element) => matchesAny(element, captureOptions.sectionHeaderSelectors))
        .map((element) => ({
          index: order.get(element),
          text: textFromElement(element),
        }))
        .filter((section) => section.text && !ignoredHeaders.has(key(section.text)));
      const expectedRows = captureOptions.expectedRows.map((row) => ({
        text: cleanText(row.Text),
        sectionHeader: cleanText(row['Section Header']),
      }));
      const expectedSections = new Set(
        expectedRows.map((row) => key(row.sectionHeader)).filter(Boolean),
      );
      const expectedTexts = new Set(
        expectedRows.map((row) => key(row.text)).filter(Boolean),
      );
      const ignoredTextPatterns = captureOptions.ignoredInformativeTextPatterns
        .map((pattern) => {
          try {
            return new RegExp(pattern, 'i');
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      function shouldIgnoreText(text) {
        return ignoredTextPatterns.some((pattern) => pattern.test(cleanText(text)));
      }

      function precedingSection(element) {
        const elementIndex = order.get(element) ?? 0;
        const previous = sectionHeaders.filter((section) => section.index < elementIndex);
        return previous.length ? previous[previous.length - 1].text : '';
      }

      const rows = [];
      const redElements = visibleElements
        .filter((element) => (
          isRedText(element)
          && !matchesAny(element, captureOptions.sectionHeaderSelectors)
          && !/^(SCRIPT|STYLE|INPUT|SELECT|TEXTAREA|OPTION|BUTTON|SVG)$/i.test(element.tagName)
        ))
        .map((element) => ({
          element,
          text: textFromElement(element),
          depth: depth(element),
        }))
        .filter((candidate) => (
          candidate.text
          && !shouldIgnoreText(candidate.text)
          && candidate.text.length <= 2_000
          && (
            expectedTexts.has(key(candidate.text))
            || /\b(?:please|note|click|information|instructions?|documentation|must|should)\b/i.test(candidate.text)
          )
        ));

      for (const expectedRow of expectedRows) {
        const exactCandidates = redElements
          .filter((candidate) => key(candidate.text) === key(expectedRow.text))
          .sort((left, right) => right.depth - left.depth);
        const selected = exactCandidates[0];
        if (!selected) {
          continue;
        }

        rows.push({
          Text: selected.text,
          'Section Header': expectedRow.sectionHeader || precedingSection(selected.element),
          'Parent Tab': captureOptions.parentTab,
        });
      }

      for (const candidate of redElements) {
        if (hasRedParent(candidate.element)) {
          continue;
        }

        if (expectedRows.some((row) => key(row.text) === key(candidate.text))) {
          continue;
        }

        const sectionHeader = precedingSection(candidate.element);

        if (expectedSections.size && !expectedSections.has(key(sectionHeader))) {
          continue;
        }

        rows.push({
          Text: candidate.text,
          'Section Header': sectionHeader,
          'Parent Tab': captureOptions.parentTab,
        });
      }

      return rows.filter((row, index, allRows) => (
        allRows.findIndex((candidate) => (
          key(candidate.Text) === key(row.Text)
          && key(candidate['Section Header']) === key(row['Section Header'])
          && key(candidate['Parent Tab']) === key(row['Parent Tab'])
        )) === index
      ));
    }, options);
  }

  async captureFieldLabels(page, parentTab = '', { includeControlFallback = false, expectedRows = [], requiredFieldOverrides = [] } = {}) {
    const options = {
      fieldLabelSelectors: this.config.fieldLabelSelectors || ['label'],
      sectionHeaderSelectors: this.config.sectionHeaderSelectors || [],
      tabSelectors: this.config.tabSelectors || [],
      ignoredSectionHeaders: this.config.ignoredSectionHeaders || [],
      ignoredFieldLabels: this.config.ignoredFieldLabels || [],
      ignoredFieldLabelPatterns: this.config.ignoredFieldLabelPatterns || [],
      pageHeadingPatterns: this.config.pageHeadingPatterns || [],
      fieldLabelMetadataPatterns: this.config.fieldLabelMetadataPatterns || [],
      includeControlFallback,
      expectedRows,
      requiredFieldOverrides,
    };

    const rows = await page.$$eval('body *', (elements, captureOptions) => {
      function cleanText(value) {
        return String(value || '')
          .replace(/\*/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\s*:\s*$/, '')
          .trim();
      }

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function matchesAny(element, selectors) {
        return selectors.some((selector) => {
          try {
            return element.matches(selector);
          } catch {
            return false;
          }
        });
      }

      function textFromElement(element) {
        if (!element) {
          return '';
        }

        const clone = element.cloneNode(true);
        if (typeof clone.querySelectorAll === 'function') {
          clone.querySelectorAll('input, select, textarea, option, button, script, style').forEach((node) => {
            node.remove();
          });
        }

        return clone.textContent || '';
      }

      function markerTextFromElement(element) {
        if (!element) {
          return '';
        }

        const clone = element.cloneNode(true);
        if (typeof clone.querySelectorAll === 'function') {
          clone.querySelectorAll('input, select, textarea, option, button, script, style').forEach((node) => {
            node.remove();
          });
        }

        return clone.textContent || '';
      }

      function nearbyText(node) {
        if (!node) {
          return '';
        }

        return node.textContent || '';
      }

      function pseudoContentHasAsterisk(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return false;
        }

        const before = window.getComputedStyle(element, '::before').content || '';
        const after = window.getComputedStyle(element, '::after').content || '';
        return `${before} ${after}`.includes('*');
      }

      function classNameHasRequiredMarker(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return false;
        }

        return /required|mandatory|asterisk/i.test(String(element.className || ''));
      }

      function nearbyElementHasRequiredMarker(element) {
        if (!element) {
          return false;
        }

        if (markerTextFromElement(element).includes('*') || pseudoContentHasAsterisk(element) || classNameHasRequiredMarker(element)) {
          return true;
        }

        if (element.nodeType !== Node.ELEMENT_NODE) {
          return false;
        }

        return Array.from(element.querySelectorAll('*')).some((child) => (
          markerTextFromElement(child).includes('*') ||
          pseudoContentHasAsterisk(child) ||
          classNameHasRequiredMarker(child)
        ));
      }

      function rowCellHasRequiredMarker(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return false;
        }

        const cell = element.closest('td, th');
        const row = element.closest('tr');
        if (!cell || !row) {
          return false;
        }

        const cells = Array.from(row.children);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex === -1) {
          return false;
        }

        const scopeCells = cells.slice(
          Math.max(0, cellIndex - 1),
          Math.min(cells.length, cellIndex + 2),
        );

        return scopeCells.some((candidate) => nearbyElementHasRequiredMarker(candidate));
      }

      function hasRequiredMarker(element, rawText) {
        if (String(rawText || '').includes('*')) {
          return true;
        }

        if (pseudoContentHasAsterisk(element) || classNameHasRequiredMarker(element)) {
          return true;
        }

        if (rowCellHasRequiredMarker(element)) {
          return true;
        }

        const nearbyNodes = [
          element.previousSibling,
          element.nextSibling,
          element.previousElementSibling,
          element.nextElementSibling,
        ];

        if (nearbyNodes.some((node) => nearbyElementHasRequiredMarker(node))) {
          return true;
        }

        const parent = element.parentElement;
        if (!parent) {
          return false;
        }

        const siblings = Array.from(parent.childNodes);
        const index = siblings.indexOf(element);
        if (index === -1) {
          return false;
        }

        const start = Math.max(0, index - 2);
        const end = Math.min(siblings.length, index + 3);
        if (siblings.slice(start, end).some((node) => nearbyElementHasRequiredMarker(node))) {
          return true;
        }

        const compactContainers = [
          element.closest('.form-group'),
          element.closest('.form-row'),
          element.closest('.mb-3'),
          element.closest('td'),
          element.closest('tr'),
        ].filter(Boolean);

        return compactContainers.some((container) => {
          const descendants = container.querySelectorAll('*');
          if (descendants.length > 30 && !['TD', 'TH'].includes(container.tagName)) {
            return false;
          }

          return nearbyElementHasRequiredMarker(container);
        });
      }

      const ignoredSectionHeaders = new Set(
        captureOptions.ignoredSectionHeaders.map((text) => cleanText(text)),
      );
      const ignoredFieldLabels = new Set(
        captureOptions.ignoredFieldLabels.map((text) => cleanText(text).toLowerCase()),
      );
      const ignoredFieldLabelPatterns = captureOptions.ignoredFieldLabelPatterns.map((pattern) => new RegExp(pattern, 'i'));
      const pageHeadingPatterns = captureOptions.pageHeadingPatterns.map((pattern) => new RegExp(pattern, 'i'));
      const fieldLabelMetadataPatterns = captureOptions.fieldLabelMetadataPatterns.map((pattern) => new RegExp(pattern, 'i'));
      const excludedTags = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'BUTTON', 'SCRIPT', 'STYLE']);
      const visibleElements = Array.from(elements).filter(isVisible);
      const order = new Map(visibleElements.map((element, index) => [element, index]));
      const sectionHeaders = visibleElements
        .filter((element) => matchesAny(element, captureOptions.sectionHeaderSelectors))
        .map((element) => ({
          index: order.get(element),
          text: cleanText(textFromElement(element)),
        }))
        .filter((section) => (
          section.text
          && !ignoredSectionHeaders.has(section.text)
          && !matchesPatternList(section.text, pageHeadingPatterns)
        ));

      function findSectionHeader(element) {
        const index = order.get(element) ?? 0;
        const previousSections = sectionHeaders.filter((section) => section.index < index);

        if (!previousSections.length) {
          return '';
        }

        return previousSections[previousSections.length - 1].text;
      }

      function shouldIgnoreLabel(label, element = null, { allowLong = false } = {}) {
        const lowerLabel = label.toLowerCase();

        return (
          !label ||
          (!allowLong && label.length > 90) ||
          matchesPatternList(label, pageHeadingPatterns) ||
          matchesPatternList(label, fieldLabelMetadataPatterns) ||
          isValueOnlyCellLabel(label, element) ||
          ignoredFieldLabels.has(lowerLabel) ||
          ignoredFieldLabelPatterns.some((pattern) => pattern.test(label))
        );
      }

      function matchesPatternList(value, patterns) {
        return patterns.some((pattern) => pattern.test(value));
      }

      function isMeaningfulFieldLabelCandidate(element, label) {
        if (!element || !label) {
          return false;
        }

        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
          return true;
        }

        if (label.includes(':')) {
          return false;
        }

        const hasAssociatedControl = () => {
          if (element.getAttribute('for')) {
            const controlId = element.getAttribute('for');
            const control = document.getElementById(controlId);
            return Boolean(control && ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName));
          }

          const nearbyControl = element.querySelector('input, select, textarea')
            || element.previousElementSibling?.matches?.('input, select, textarea')
            || element.nextElementSibling?.matches?.('input, select, textarea');
          if (nearbyControl) {
            return true;
          }

          const container = element.closest('.form-group, .form-row, .mb-3');
          if (!container) {
            return false;
          }

          return Boolean(container.querySelector('input, select, textarea'));
        };

        return Boolean(
          element.tagName === 'LABEL'
          || element.matches('.control-label, .form-label, .field-label, .label-control')
          || element.getAttribute('controlname')
          || element.getAttribute('aria-label')
        ) && hasAssociatedControl();
      }

      function canonicalNearLabelText(value) {
        return cleanText(value)
          .toLowerCase()
          .replace(/\bids\b/g, 'id')
          .replace(/[^a-z0-9]+/g, '');
      }

      function wordTokens(value) {
        return cleanText(value)
          .toLowerCase()
          .replace(/\bids\b/g, 'id')
          .match(/[a-z0-9]+/g) || [];
      }

      function hasPrefixOrSuffixWordingDifference(leftValue, rightValue) {
        const leftTokens = wordTokens(leftValue);
        const rightTokens = wordTokens(rightValue);

        if (!leftTokens.length || !rightTokens.length || leftTokens.length === rightTokens.length) {
          return false;
        }

        const shorter = leftTokens.length < rightTokens.length ? leftTokens : rightTokens;
        const longer = leftTokens.length < rightTokens.length ? rightTokens : leftTokens;
        const matchesAt = (startIndex) => shorter.every(
          (token, index) => token === longer[startIndex + index],
        );

        return matchesAt(0) || matchesAt(longer.length - shorter.length);
      }

      function sectionHeadersAreNear(leftValue, rightValue) {
        const left = canonicalNearLabelText(leftValue);
        const right = canonicalNearLabelText(rightValue);

        if (!left || !right) {
          return left === right;
        }

        return left === right || hasPrefixOrSuffixWordingDifference(leftValue, rightValue);
      }

      function rowHasExactOrNearLabel(row, expectedLabel, expectedSectionHeader) {
        const rowLabel = cleanText(row['Field Label']);
        const rowSectionHeader = cleanText(row['Section Header']);
        const normalizedExpectedSection = cleanText(expectedSectionHeader);

        if (rowLabel === expectedLabel && rowSectionHeader === normalizedExpectedSection) {
          return true;
        }

        return canonicalNearLabelText(rowLabel) === canonicalNearLabelText(expectedLabel)
          && sectionHeadersAreNear(rowSectionHeader, normalizedExpectedSection);
      }

      function requiredFieldValue(label, sectionHeader, element, rawText) {
        const override = requiredOverrideFor(label, sectionHeader);
        if (override) {
          return normalizeRequiredValue(override.required);
        }

        return hasRequiredMarker(element, rawText) ? 'Yes' : 'No';
      }

      function requiredOverrideFor(label, sectionHeader) {
        const normalizedLabel = cleanText(label).toLowerCase();
        const normalizedSection = cleanText(sectionHeader).toLowerCase();

        return (captureOptions.requiredFieldOverrides || []).find((override) => {
          const overrideLabel = cleanText(override.fieldLabel).toLowerCase();
          const overrideSection = cleanText(override.sectionHeader).toLowerCase();

          return overrideLabel === normalizedLabel
            && (!overrideSection || overrideSection === normalizedSection);
        });
      }

      function normalizeRequiredValue(value) {
        const normalized = cleanText(value).toLowerCase();
        return ['no', 'n', 'false', 'optional', '0'].includes(normalized) ? 'No' : 'Yes';
      }

      function isValueOnlyCellLabel(label, element) {
        if (!element) {
          return false;
        }

        if (!/^(yes|no|true|false|n\/a|none|not registered)$/i.test(label)) {
          return false;
        }

        if (
          element.tagName === 'LABEL' &&
          element.hasAttribute('controlname') &&
          !element.getAttribute('for')
        ) {
          return true;
        }

        if (element.tagName === 'LABEL') {
          return false;
        }

        if (element.getAttribute('for') || element.getAttribute('aria-label')) {
          return false;
        }

        const fieldControl = element.querySelector('input, select, textarea');
        if (fieldControl) {
          return false;
        }

        const cell = element.closest('td, th');
        const row = element.closest('tr');
        if (!cell || !row) {
          return false;
        }

        const cells = Array.from(row.children);
        const cellIndex = cells.indexOf(cell);
        if (cellIndex <= 0) {
          return false;
        }

        const previousText = cleanText(textFromElement(cells[cellIndex - 1]));
        return Boolean(previousText && previousText !== label);
      }

      function controlLabelText(element) {
        const directText = cleanText(
          element.getAttribute('aria-label') ||
          element.getAttribute('placeholder') ||
          element.getAttribute('title') ||
          '',
        );
        if (directText) return directText;

        const parentLabel = element.closest('label');
        const parentLabelText = cleanText(textFromElement(parentLabel));
        if (parentLabelText) return parentLabelText;

        const id = element.getAttribute('id');
        if (id) {
          const escapedId = window.CSS?.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
          const associatedLabel = document.querySelector(`label[for="${escapedId}"]`);
          const associatedLabelText = cleanText(textFromElement(associatedLabel));
          if (associatedLabelText) return associatedLabelText;
        }

        const cell = element.closest('td, th');
        const row = element.closest('tr');
        if (cell && row) {
          const cells = Array.from(row.children);
          const cellIndex = cells.indexOf(cell);

          for (let index = cellIndex - 1; index >= 0; index -= 1) {
            const previousCellText = cleanText(textFromElement(cells[index]));
            if (previousCellText) return previousCellText;
          }
        }

        const compactContainer = element.closest('.form-group, .form-row, .mb-3');
        if (compactContainer) {
          const labelCandidate = compactContainer.querySelector('label, .control-label, .form-label, .field-label, .label-control');
          const labelCandidateText = cleanText(textFromElement(labelCandidate));
          if (labelCandidateText) return labelCandidateText;
        }

        return '';
      }

      function isCapturableControl(element) {
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
          return false;
        }

        const type = String(element.getAttribute('type') || '').toLowerCase();
        return !['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(type);
      }

      const rows = [];

      for (const element of visibleElements) {
        if (!matchesAny(element, captureOptions.fieldLabelSelectors)) {
          continue;
        }

        if (
          matchesAny(element, captureOptions.sectionHeaderSelectors) ||
          matchesAny(element, captureOptions.tabSelectors) ||
          excludedTags.has(element.tagName)
        ) {
          continue;
        }

        const rawText = textFromElement(element);
        const label = cleanText(rawText);

        if (shouldIgnoreLabel(label, element) || !isMeaningfulFieldLabelCandidate(element, label)) {
          continue;
        }

        rows.push({
          'Field Label': label,
          'Section Header': findSectionHeader(element),
          'Required Field': requiredFieldValue(label, findSectionHeader(element), element, rawText),
        });
      }

      if (captureOptions.includeControlFallback) {
        for (const element of visibleElements) {
          if (!isCapturableControl(element)) {
            continue;
          }

          const rawText = controlLabelText(element);
          const label = cleanText(rawText);

          if (shouldIgnoreLabel(label, element) || !isMeaningfulFieldLabelCandidate(element, label)) {
            continue;
          }

          rows.push({
            'Field Label': label,
            'Section Header': findSectionHeader(element),
            'Required Field': requiredFieldValue(label, findSectionHeader(element), element, rawText),
          });
        }
      }

      for (const expectedRow of captureOptions.expectedRows || []) {
        const expectedLabel = cleanText(expectedRow['Field Label']);
        const expectedSectionHeader = cleanText(expectedRow['Section Header']);

        if (shouldIgnoreLabel(expectedLabel, null, { allowLong: true })) {
          continue;
        }

        const expectedKey = `${expectedLabel} | ${expectedSectionHeader}`;
        if (
          rows.some((row) => `${row['Field Label']} | ${row['Section Header']}` === expectedKey)
          || rows.some((row) => rowHasExactOrNearLabel(row, expectedLabel, expectedSectionHeader))
        ) {
          continue;
        }

        const candidate = findExpectedTextCandidate(expectedLabel, expectedSectionHeader);
        if (!candidate) {
          continue;
        }

        const actualSectionHeader = findSectionHeader(candidate);
        if (
          expectedSectionHeader
          && !sectionHeadersAreNear(actualSectionHeader, expectedSectionHeader)
        ) {
          continue;
        }

        rows.push({
          'Field Label': expectedLabel,
          'Section Header': actualSectionHeader,
          'Required Field': requiredFieldValue(
            expectedLabel,
            actualSectionHeader,
            candidate,
            candidate.textContent || '',
          ),
        });
      }

      const seen = new Set();
      return rows.filter((row) => {
        const key = `${row['Field Label']} | ${row['Section Header']}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });

      function findExpectedTextCandidate(expectedLabel, expectedSectionHeader) {
        const normalizedExpectedLabel = cleanText(expectedLabel).toLowerCase();
        const normalizedExpectedSection = cleanText(expectedSectionHeader).toLowerCase();

        if (!normalizedExpectedLabel) {
          return null;
        }

        const candidates = visibleElements
          .filter((element) => !excludedTags.has(element.tagName))
          .filter((element) => {
            const candidateText = cleanText(textFromElement(element));
            return (
              !matchesPatternList(candidateText, pageHeadingPatterns) &&
              !matchesPatternList(candidateText, fieldLabelMetadataPatterns) &&
              expectedTextMatches(candidateText, expectedLabel)
            );
          })
          .filter((element) => !matchesAny(element, captureOptions.tabSelectors))
          .map((element, index) => ({
            element,
            score: scoreExpectedTextCandidate(element, index, normalizedExpectedSection),
          }))
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => right.score - left.score);

        return candidates[0]?.element || null;
      }

      function expectedTextMatches(candidateText, expectedLabel) {
        const candidate = cleanText(candidateText);
        const expected = cleanText(expectedLabel);

        if (!candidate || !expected) {
          return false;
        }

        if (candidate.toLowerCase() === expected.toLowerCase()) {
          return true;
        }

        return canonicalNearLabelText(candidate) === canonicalNearLabelText(expected);
      }

      function scoreExpectedTextCandidate(element, index, normalizedExpectedSection) {
        let score = 10;
        const section = cleanText(findSectionHeader(element)).toLowerCase();

        if (normalizedExpectedSection && section === normalizedExpectedSection) {
          score += 25;
        } else if (
          normalizedExpectedSection
          && hasPrefixOrSuffixWordingDifference(section, normalizedExpectedSection)
        ) {
          score += 15;
        } else if (normalizedExpectedSection) {
          return -1;
        }

        if (matchesAny(element, captureOptions.sectionHeaderSelectors)) {
          score -= 8;
        }

        if (element.closest('td, th, .form-group, .form-row, .mb-3')) {
          score += 5;
        }

        return score - (index * 0.01);
      }
    }, options);

    return rows
      .filter((row) => !this.shouldIgnoreCapturedText(row['Field Label'], 'fieldLabel'))
      .map((row) => ({
        ...row,
        'Parent Tab': parentTab,
      }));
  }

  async clickTab(page, tabName) {
    if (await this.clickAngularRoleTab(page, tabName)) {
      return;
    }

    const selectorCandidate = page
      .locator(this.config.tabSelectors.join(','))
      .filter({ hasText: tabName })
      .first();
    if (await this.clickIfVisible(selectorCandidate)) {
      return;
    }

    const exactLink = page.getByRole('link', { name: tabName, exact: true }).first();
    if (await this.clickIfVisible(exactLink)) {
      return;
    }

    this.warnings.push(`Could not click tab "${tabName}". Capturing currently visible section headers.`);
  }

  async clickAngularRoleTab(page, tabName) {
    const initialTab = page.getByRole('tab', { name: tabName, exact: true }).first();
    if (!(await initialTab.count().catch(() => 0)) || !(await initialTab.isVisible().catch(() => false))) {
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const roleTab = page.getByRole('tab', { name: tabName, exact: true }).first();
      const visible = await roleTab
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (!visible) {
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        continue;
      }

      if (await this.roleTabIsSelected(roleTab)) {
        return true;
      }

      await roleTab.click({ noWaitAfter: true }).catch(() => {});
      if (await this.waitForAngularRoleTabSelection(page, tabName, 12_000)) {
        return true;
      }
    }

    return false;
  }

  async waitForAngularRoleTabSelection(page, tabName, timeoutMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      await page.waitForLoadState('domcontentloaded', { timeout: 1_000 }).catch(() => {});
      const roleTab = page.getByRole('tab', { name: tabName, exact: true }).first();

      if (await this.roleTabIsSelected(roleTab)) {
        return true;
      }

      await waitForPageTimeout(page, 250, `waiting for "${tabName}" tab activation`);
    }

    return false;
  }

  async roleTabIsSelected(locator) {
    if (!(await locator.count().catch(() => 0)) || !(await locator.isVisible().catch(() => false))) {
      return false;
    }

    return locator.evaluate((element) => (
      element.getAttribute('aria-selected') === 'true'
      || element.classList.contains('mdc-tab--active')
      || element.classList.contains('active')
      || element.classList.contains('selected')
    )).catch(() => false);
  }

  async clickIfVisible(locator) {
    try {
      if ((await locator.count()) === 0) {
        return false;
      }

      if (!(await locator.isVisible())) {
        return false;
      }

      await locator.click();
      return true;
    } catch {
      return false;
    }
  }

  async collectVisibleTexts(page, selectors) {
    const selector = selectors.join(',');

    return page.$$eval(selector, (elements) => {
      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      return elements
        .filter(isVisible)
        .map((element) => element.innerText || element.textContent || '')
        .map((text) => text.replace(/\*/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    }).then((texts) => texts.map(normalizeText));
  }
}
