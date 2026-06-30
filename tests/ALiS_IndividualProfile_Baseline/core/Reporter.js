import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fills = {
  PASS: 'FFC6EFCE',
  MISSING: 'FFFFC7CE',
  EXTRA: 'FFFFEB9C',
  HEADER: 'FF1F4E78',
};

const defaultFont = {
  name: 'Arial',
  size: 11,
};

const allBorders = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const reportColumnOrderByTestCase = {
  TC01: ['Tab Name'],
  TC02: ['Parent Tab', 'Section Header'],
  TC03: ['Parent Tab', 'Section Header', 'Field Label', 'Required Field'],
  TC04: ['Parent Tab', 'Section Header', 'Column Header', 'Column Order'],
  TC05: ['Parent Tab', 'Section Header', 'Text'],
};

export class Reporter {
  constructor({ reportDir = path.join(frameworkRoot, 'test-results') } = {}) {
    this.reportDir = reportDir;
  }

  async prepareOutputDir() {
    const resolvedReportDir = path.resolve(this.reportDir);
    const relativeReportDir = path.relative(frameworkRoot, resolvedReportDir);

    if (relativeReportDir.startsWith('..') || path.isAbsolute(relativeReportDir)) {
      throw new Error(`Refusing to clean output directory outside framework root: ${resolvedReportDir}`);
    }

    await fs.mkdir(resolvedReportDir, { recursive: true });

    await Promise.all([
      this.removeIfUnlocked(path.join(resolvedReportDir, 'latest-results.json')),
      this.removeIfUnlocked(path.join(resolvedReportDir, 'latest-failure.png')),
      this.removeIfUnlocked(path.join(resolvedReportDir, 'playwright-report')),
    ]);

    const entries = await fs.readdir(resolvedReportDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^~?\$?latest-report.*\.xlsx$/i.test(entry.name))
        .map((entry) => this.removeIfUnlocked(path.join(resolvedReportDir, entry.name))),
    );
  }

  async write({ results, context }) {
    await fs.mkdir(this.reportDir, { recursive: true });

    const preferredExcelPath = path.join(this.reportDir, 'latest-report.xlsx');
    const jsonPath = path.join(this.reportDir, 'latest-results.json');
    const htmlReportPath = path.join(this.reportDir, 'playwright-report', 'index.html');
    const reportContext = {
      ...context,
      generatedAt: formatReportTimestamp(),
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ALiS';
    workbook.created = new Date();

    this.addSummarySheet(workbook, results, reportContext);
    for (const result of results) {
      this.addTestCaseSheet(workbook, result);
    }
    this.formatWorkbook(workbook);

    const excelPath = await this.writeWorkbookWithFallback(workbook, preferredExcelPath);
    await fs.writeFile(
      jsonPath,
      JSON.stringify(
        {
          context: reportContext,
          reportPaths: {
            excelPath,
            jsonPath,
            htmlReportPath,
          },
          results,
        },
        null,
        2,
      ),
    );
    await this.writeHtmlReport({ htmlReportPath, results, context: reportContext, excelPath, jsonPath });

    return {
      excelPath,
      jsonPath,
      htmlReportPath,
    };
  }

  async removeIfUnlocked(targetPath) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (error) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
        return;
      }

      throw error;
    }
  }

  async writeWorkbookWithFallback(workbook, preferredExcelPath) {
    try {
      await workbook.xlsx.writeFile(preferredExcelPath);
      return preferredExcelPath;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
        throw error;
      }

      const fallbackPath = path.join(
        path.dirname(preferredExcelPath),
        `latest-report-${Date.now()}.xlsx`,
      );
      await workbook.xlsx.writeFile(fallbackPath);
      return fallbackPath;
    }
  }

  async writeHtmlReport({ htmlReportPath, results, context, excelPath, jsonPath }) {
    await fs.mkdir(path.dirname(htmlReportPath), { recursive: true });

    const passed = results.filter((result) => result.comparison.passed).length;
    const failed = results.length - passed;
    const status = failed ? 'FAILED' : 'PASSED';
    const generatedAt = context.generatedAt || formatReportTimestamp();

    const testCards = results.map((result) => this.testCaseHtml(result)).join('\n');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ALiS Individual Profile Baseline Report</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #5b667a;
      --border: #d8dee9;
      --pass: #137333;
      --fail: #b3261e;
      --warn: #9a6700;
      --blue: #1f4e78;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 14px;
    }
    header {
      background: var(--blue);
      color: #fff;
      padding: 22px 28px;
    }
    header h1 {
      margin: 0 0 6px;
      font-size: 24px;
      font-weight: 650;
    }
    header p { margin: 0; color: #dbe8f4; }
    main { padding: 24px 28px 36px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
    }
    .metric .label { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .status-passed { color: var(--pass); }
    .status-failed { color: var(--fail); }
    .meta {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 8px 14px;
      margin-bottom: 18px;
    }
    .meta div:nth-child(odd) { color: var(--muted); }
    h2 { margin: 0 0 12px; font-size: 18px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 9px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .tc { margin-top: 14px; }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 12px;
      font-weight: 700;
    }
    .badge-pass { background: #dff3e6; color: var(--pass); }
    .badge-fail { background: #fce8e6; color: var(--fail); }
    .links a { color: var(--blue); text-decoration: none; font-weight: 600; }
    .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>ALiS Individual Profile Baseline Report</h1>
    <p>${escapeHtml(context.businessUnit.id)} | ${escapeHtml(context.flowLabel || `Flow ${context.flow}`)} | ${escapeHtml(generatedAt)}</p>
  </header>
  <main>
    <section class="summary">
      <div class="metric"><div class="label">Status</div><div class="value ${failed ? 'status-failed' : 'status-passed'}">${status}</div></div>
      <div class="metric"><div class="label">Total</div><div class="value">${results.length}</div></div>
      <div class="metric"><div class="label">Passed</div><div class="value status-passed">${passed}</div></div>
      <div class="metric"><div class="label">Failed</div><div class="value status-failed">${failed}</div></div>
    </section>

    <section class="panel">
      <h2>Run Details</h2>
      <div class="meta">
        <div>Business Unit</div><div>${escapeHtml(context.businessUnit.id)} - ${escapeHtml(context.businessUnit.name)}</div>
        <div>Client</div><div>${escapeHtml(formatEnvironment(context.environment))}</div>
        <div>Browser</div><div>${escapeHtml(formatBrowserProject(context.browserProject))}</div>
        <div>Flow</div><div>${escapeHtml(context.flowLabel || `Flow ${context.flow}`)}</div>
        <div>Profile Name</div><div>${escapeHtml(context.entityName)}</div>
        <div>Execution Time</div><div>${escapeHtml(formatDuration(context.timings?.totalMs))}</div>
        <div>Login URL</div><div>${escapeHtml(context.environment.loginUrl)}</div>
      </div>
      <div class="links">
        <a href="${pathToHref(excelPath)}">Open Excel Result</a>
        &nbsp;|&nbsp;
        <a href="${pathToHref(jsonPath)}">Open JSON Result</a>
      </div>
    </section>

    ${testCards}
  </main>
</body>
</html>`;

    await fs.writeFile(htmlReportPath, html, 'utf8');
  }

  testCaseHtml(result) {
    const { comparison } = result;
    const status = comparison.passed ? 'PASS' : 'FAIL';
    const badgeClass = comparison.passed ? 'badge-pass' : 'badge-fail';
    const detailRows = [
      ...comparison.mismatch.map((row) => ['Mismatch', this.formatDetailKey(result, row), this.formatDifferences(row.differences)]),
      ...comparison.missing.map((row) => ['Missing', this.formatDetailKey(result, row), cleanReportMessage(row.message || 'Expected in Excel, missing from live UI')]),
      ...comparison.extra.map((row) => ['Extra', this.formatDetailKey(result, row), cleanReportMessage(row.message || 'Present in live UI, missing from Excel')]),
    ];

    const detailsHtml = detailRows.length
      ? detailRows.map(([type, key, detail]) => `
        <tr>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(key)}</td>
          <td>${escapeHtml(detail)}</td>
        </tr>`).join('')
      : '<tr><td colspan="3">No mismatch, missing, or extra records.</td></tr>';

    return `<section class="panel tc">
      <h2>${escapeHtml(result.id)} - ${escapeHtml(result.name)} <span class="badge ${badgeClass}">${status}</span></h2>
      <table>
        <thead>
          <tr>
            <th>Expected</th>
            <th>Actual</th>
            <th>Matched</th>
            <th>Mismatch</th>
            <th>Missing</th>
            <th>Extra</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${comparison.summary.expected}</td>
            <td>${comparison.summary.actual}</td>
            <td>${comparison.summary.matched}</td>
            <td>${comparison.summary.mismatch}</td>
            <td>${comparison.summary.missing}</td>
            <td>${comparison.summary.extra}</td>
            <td>${escapeHtml(formatDuration(result.durationMs))}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr><th>Type</th><th>Key</th><th>Details</th></tr>
        </thead>
        <tbody>${detailsHtml}</tbody>
      </table>
    </section>`;
  }

  formatDifferences(differences) {
    return differences
      .map((item) => cleanReportMessage(item.message || `${item.column}: expected="${item.baseline}", live="${item.actual}"`))
      .join('; ');
  }

  formatDetailKey(result, row) {
    const comparisonKeys = new Set(result.comparison.keys || []);
    const orderedKeys = this.reportColumnsFor(result, result.comparison.keys || [])
      .filter((column) => comparisonKeys.has(column));
    const source = row.baseline || row.actual || {};
    const values = orderedKeys
      .map((column) => source[column])
      .filter((value) => String(value ?? '').trim());

    return values.length ? values.join(' | ') : row.key;
  }

  addSummarySheet(workbook, results, context) {
    const sheet = workbook.addWorksheet('Summary');

    sheet.columns = [
      { width: 24 },
      { width: 76 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
    ];

    sheet.addRow(['Item', 'Value']);
    sheet.addRows([
      ['Business Unit', `${context.businessUnit.id} - ${context.businessUnit.name}`],
      ['Client', formatEnvironment(context.environment)],
      ['Browser', formatBrowserProject(context.browserProject)],
      ['Login URL', context.environment.loginUrl],
      ['Flow', context.flowLabel || `Flow ${context.flow}`],
      ['Profile Name', context.entityName],
      ['Execution Time', formatDuration(context.timings?.totalMs)],
      ['Generated At', context.generatedAt || formatReportTimestamp()],
    ]);

    sheet.addRow([]);
    const summaryHeaderRowNumber = sheet.rowCount + 1;
    sheet.addRow(['Test Case', 'Status', 'Expected', 'Actual', 'Matched', 'Mismatch', 'Missing', 'Extra', 'Duration']);

    for (const result of results) {
      sheet.addRow([
        `${result.id} - ${result.name}`,
        result.comparison.passed ? 'PASS' : 'FAIL',
        result.comparison.summary.expected,
        result.comparison.summary.actual,
        result.comparison.summary.matched,
        result.comparison.summary.mismatch,
        result.comparison.summary.missing,
        result.comparison.summary.extra,
        formatDuration(result.durationMs),
      ]);
    }

    this.styleHeaderRow(sheet.getRow(1));
    this.styleHeaderRow(sheet.getRow(summaryHeaderRowNumber));
    this.applyStatusStyles(sheet, summaryHeaderRowNumber + 1, results.length, 2);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  addTestCaseSheet(workbook, result) {
    const sheet = workbook.addWorksheet(this.safeSheetName(result.id));
    const keys = result.comparison.keys;
    const reportColumns = this.reportColumnsFor(result, keys);
    const pairedColumns = reportColumns.flatMap((key) => ([
      { header: `Expected ${key}`, key: `expected_${key}`, width: 30 },
      { header: `Actual ${key}`, key: `actual_${key}`, width: 30 },
    ]));

    sheet.columns = [
      { header: 'Status', key: 'status', width: 14 },
      ...pairedColumns,
      { header: 'Details', key: 'details', width: 48 },
    ];

    for (const row of result.comparison.matched) {
      sheet.addRow(this.toReportRow('PASS', row, reportColumns, 'Found in expected data and live UI'));
    }

    for (const row of result.comparison.missing) {
      sheet.addRow(this.toReportRow('MISSING', row, reportColumns, cleanReportMessage(row.message || 'Expected in Excel, missing from live UI')));
    }

    for (const row of result.comparison.mismatch) {
      sheet.addRow(this.toReportRow('MISMATCH', row, reportColumns, this.formatDifferences(row.differences)));
    }

    for (const row of result.comparison.extra) {
      sheet.addRow(this.toReportRow('EXTRA', row, reportColumns, cleanReportMessage(row.message || 'Present in live UI, missing from Excel')));
    }

    this.styleHeaderRow(sheet.getRow(1));
    this.applyStatusStyles(sheet, 2, sheet.rowCount - 1, 1);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: 'A1',
      to: sheet.getCell(1, sheet.columnCount).address,
    };
  }

  toReportRow(status, row, keys, details) {
    const pairedValues = keys.flatMap((key) => [
      row.baseline?.[key] || '',
      row.actual?.[key] || '',
    ]);

    return [
      status,
      ...pairedValues,
      details,
    ];
  }

  styleHeaderRow(row) {
    row.font = { ...defaultFont, bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.HEADER } };
  }

  applyStatusStyles(sheet, startRow, rowCount, statusColumn) {
    for (let rowNumber = startRow; rowNumber < startRow + rowCount; rowNumber += 1) {
      const cell = sheet.getRow(rowNumber).getCell(statusColumn);
      const value = String(cell.value || '').toUpperCase();

      if (value.includes('PASS')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.PASS } };
      } else if (value.includes('MISSING') || value.includes('FAIL')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.MISSING } };
      } else if (value.includes('EXTRA') || value.includes('MISMATCH')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.EXTRA } };
      }
    }
  }

  safeSheetName(name) {
    return name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  }

  reportColumnsFor(result, fallbackColumns) {
    return reportColumnOrderByTestCase[result.id]
      || result.comparison.reportColumns
      || fallbackColumns;
  }

  formatWorkbook(workbook) {
    workbook.eachSheet((sheet) => {
      for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        for (let columnNumber = 1; columnNumber <= sheet.columnCount; columnNumber += 1) {
          const cell = row.getCell(columnNumber);
          cell.font = {
            ...defaultFont,
            ...(cell.font || {}),
            name: defaultFont.name,
            size: defaultFont.size,
          };
          cell.alignment = {
            ...(cell.alignment || {}),
            wrapText: true,
            vertical: cell.alignment?.vertical || 'top',
          };
          cell.border = allBorders;
        }
      }
    });
  }
}

function cleanReportMessage(message) {
  return String(message || '')
    .replace(/Excel baseline/gi, 'Excel')
    .replace(/baseline/gi, 'expected data');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pathToHref(filePath) {
  return `file:///${path.resolve(filePath).replace(/\\/g, '/')}`;
}

function formatReportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  return [
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    `${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`,
  ].join(' ');
}

function formatDuration(durationMs = 0) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function formatEnvironment(environment) {
  if (!environment) {
    return 'Testing';
  }

  if (!environment.id || environment.id === environment.name) {
    return environment.name || environment.id || 'Testing';
  }

  return `${environment.id} - ${environment.name}`;
}

function formatBrowserProject(browserProject) {
  if (!browserProject) {
    return '';
  }

  return browserProject.name || browserProject.id || '';
}
