import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import runSettings from '../../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultReportDir = path.join(frameworkRoot, runSettings.reports.outputDir);

const fills = {
  PASS: runSettings.excel.passColor,
  FAIL: runSettings.excel.failColor,
  WARN: runSettings.excel.warnColor,
  HEADER: runSettings.excel.headerColor,
  ZEBRA: runSettings.excel.zebraColor,
};

export async function writeExcelReport({
  file1Name,
  file2Name,
  result,
  lines1,
  lines2,
}, { reportDir = defaultReportDir } = {}) {
  await fs.mkdir(reportDir, { recursive: true });
  await removeOldExcelReports(reportDir);

  const generatedAt = formatReportTimestamp();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ContentComparison';
  workbook.created = new Date();

  addSummarySheet(workbook, { file1Name, file2Name, result, lines1, lines2, generatedAt });
  addMatchedLinesSheet(workbook, result.matchedLines);
  addMismatchLinesSheet(workbook, result.mismatchLines);
  addMissingLinesSheet(workbook, result.missingLines);
  addExtraLinesSheet(workbook, result.extraLines);
  addTableBordersSheet(workbook, result.tableBorders);

  const excelPath = await writeWorkbookWithFallback(
    workbook,
    path.join(reportDir, runSettings.reports.latestExcelFile),
  );

  await fs.writeFile(
    path.join(reportDir, runSettings.reports.latestJsonFile),
    JSON.stringify({
      generatedAt,
      expectedFile: file1Name,
      actualFile: file2Name,
      summary: toSummary(result, lines1, lines2),
      excelPath,
    }, null, 2),
    'utf8',
  );

  return excelPath;
}

function addSummarySheet(workbook, context) {
  const { file1Name, file2Name, result, lines1, lines2, generatedAt } = context;
  const summary = toSummary(result, lines1, lines2);
  const failedCount = summary.mismatch + summary.missing + summary.extra + summary.tableBordersMissing;

  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Value', key: 'value', width: 78 },
  ];

  sheet.addRows([
    { item: 'Framework', value: 'ContentComparison' },
    { item: 'Expected File', value: file1Name },
    { item: 'Actual File', value: file2Name },
    { item: 'Generated At', value: generatedAt },
    { item: 'Overall Status', value: failedCount ? 'FAILED' : 'PASSED' },
    { item: 'Expected Line Count', value: summary.expectedLines },
    { item: 'Actual Line Count', value: summary.actualLines },
  ]);

  sheet.addRow([]);
  sheet.addRow(['Test Case', 'Status', 'Expected Count', 'Actual Count', 'Matched', 'Mismatch/Missing', 'Extra']);
  sheet.addRow(['Matched Lines', summary.matched ? 'PASS' : 'WARN', summary.expectedLines, summary.actualLines, summary.matched, 0, 0]);
  sheet.addRow(['Mismatch Lines', summary.mismatch ? 'FAIL' : 'PASS', summary.expectedLines, summary.actualLines, 0, summary.mismatch, 0]);
  sheet.addRow(['Missing Lines', summary.missing ? 'FAIL' : 'PASS', summary.expectedLines, summary.actualLines, 0, summary.missing, 0]);
  sheet.addRow(['Extra Lines', summary.extra ? 'FAIL' : 'PASS', summary.expectedLines, summary.actualLines, 0, 0, summary.extra]);
  sheet.addRow([
    'Table Borders',
    summary.tableBordersMissing ? 'FAIL' : 'PASS',
    summary.tableBordersChecked,
    summary.tableBordersChecked,
    summary.tableBordersMatched,
    summary.tableBordersMissing,
    0,
  ]);

  styleHeaderRow(sheet.getRow(1));
  styleHeaderRow(sheet.getRow(10));
  applyStatusStyles(sheet, 11, sheet.rowCount, 2);
  polishWorksheet(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addMatchedLinesSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('MatchedLines');
  applyLineColumns(sheet);

    for (const row of rows) {
      sheet.addRow({
        status: 'PASS',
        expectedLine: row.template,
        actualLine: row.letter,
        details: row.details || 'Line matched in Expected and Actual.',
      });
    }

  finalizeSheet(sheet);
}

function addMismatchLinesSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('MismatchLines');
  applyLineColumns(sheet, { includeTextDifference: true });

    for (const row of rows) {
      sheet.addRow({
        status: 'MISMATCH',
        expectedLine: row.template,
        actualLine: row.letter,
        textDifference: row.textDifference || '',
        details: row.details || 'Expected line and Actual line are similar, but not equal.',
      });
    }

  finalizeSheet(sheet);
}

function addMissingLinesSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('MissingLines');
  applyLineColumns(sheet);

  for (const row of rows) {
    sheet.addRow({
      status: 'MISSING',
      expectedLine: lineTemplate(row),
      actualLine: '',
      details: row.details || 'Expected line was not found in Actual.',
    });
  }

  finalizeSheet(sheet);
}

function addExtraLinesSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('ExtraLines');
  applyLineColumns(sheet);

  for (const row of rows) {
    sheet.addRow({
      status: 'EXTRA',
      expectedLine: '',
      actualLine: lineActual(row),
      details: row.details || 'Actual line was not found in Expected.',
    });
  }

  finalizeSheet(sheet);
}

function addTableBordersSheet(workbook, tableBorders = { matched: [], missing: [] }) {
  const sheet = workbook.addWorksheet('TableBorders');
  sheet.columns = [
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Expected Table', key: 'expectedTable', width: 24 },
    { header: 'Actual Table', key: 'actualTable', width: 26 },
    { header: 'Expected Row Count', key: 'expectedRows', width: 20 },
    { header: 'Actual Row Count', key: 'actualRows', width: 18 },
    { header: 'Expected Column Count', key: 'expectedColumns', width: 23 },
    { header: 'Actual Column Count', key: 'actualColumns', width: 21 },
    { header: 'Details', key: 'details', width: 70 },
  ];

  for (const row of tableBorders.matched || []) {
    sheet.addRow(toTableBorderRow('PASS', row));
  }

  for (const row of tableBorders.missing || []) {
    sheet.addRow(toTableBorderRow('MISSING', row));
  }

  finalizeSheet(sheet);
}

function applyLineColumns(sheet, options = {}) {
  const columns = [
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Expected Line', key: 'expectedLine', width: 80 },
    { header: 'Actual Line', key: 'actualLine', width: 80 },
  ];

  if (options.includeTextDifference) {
    columns.push({ header: 'Difference', key: 'textDifference', width: 70 });
  }

  columns.push({ header: 'Details', key: 'details', width: 54 });
  sheet.columns = columns;
}

function lineTemplate(row) {
  return typeof row === 'string' ? row : row.template || '';
}

function lineActual(row) {
  return typeof row === 'string' ? row : row.letter || '';
}

function toTableBorderRow(status, row) {
  const component = row.component;
  return {
    status,
    expectedTable: `Table ${row.tableNumber}`,
    actualTable: component ? `Page ${row.pageNumber}` : '',
    expectedRows: row.rowCount,
    actualRows: component ? component.yLineCount - 1 : '',
    expectedColumns: row.columnCount,
    actualColumns: component ? component.xLineCount - 1 : '',
    details: component
      ? `Matched bordered table candidate. Page score: ${formatScore(row.pageScore)}. Snippet: ${row.snippet}`
      : `Expected bordered table was not found in Actual. Best page score: ${formatScore(row.pageScore)}. Snippet: ${row.snippet}`,
  };
}

function finalizeSheet(sheet) {
  styleHeaderRow(sheet.getRow(1));
  applyStatusStyles(sheet, 2, sheet.rowCount, 1);
  polishWorksheet(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: sheet.getCell(1, sheet.columnCount).address,
  };
}

function toSummary(result, lines1, lines2) {
  const tableBorders = result.tableBorders || { checked: 0, matched: [], missing: [] };

  return {
    expectedLines: lines1.length,
    actualLines: lines2.length,
    matched: result.matchedLines.length,
    mismatch: result.mismatchLines.length,
    missing: result.missingLines.length,
    extra: result.extraLines.length,
    tableBordersChecked: tableBorders.checked || 0,
    tableBordersMatched: tableBorders.matched?.length || 0,
    tableBordersMissing: tableBorders.missing?.length || 0,
  };
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.HEADER } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 24;
}

function applyStatusStyles(sheet, startRow, endRow, statusColumn) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const cell = sheet.getRow(rowNumber).getCell(statusColumn);
    const value = String(cell.value || '').toUpperCase();

    if (value.includes('PASS')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.PASS } };
    } else if (value.includes('MISSING') || value.includes('FAIL')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.FAIL } };
    } else if (value.includes('EXTRA') || value.includes('MISMATCH') || value.includes('WARN')) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.WARN } };
    }
  }
}

function polishWorksheet(sheet) {
  sheet.properties.defaultRowHeight = 21;
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = thinBorder();

      if (rowNumber > 1 && rowNumber % 2 === 0 && !hasFill(cell)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.ZEBRA } };
      }

      if (colNumber === 1 && rowNumber > 1) {
        cell.font = { ...(cell.font || {}), bold: true };
      }
    });
  });
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: runSettings.excel.borderColor } },
    left: { style: 'thin', color: { argb: runSettings.excel.borderColor } },
    bottom: { style: 'thin', color: { argb: runSettings.excel.borderColor } },
    right: { style: 'thin', color: { argb: runSettings.excel.borderColor } },
  };
}

function hasFill(cell) {
  return Boolean(cell.fill?.fgColor?.argb);
}

async function removeOldExcelReports(reportDir) {
  const entries = await fs.readdir(reportDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^~?\$?latest-report.*\.xlsx$/i.test(entry.name))
      .map((entry) => fs.rm(path.join(reportDir, entry.name), { force: true }).catch(() => {})),
  );
}

async function writeWorkbookWithFallback(workbook, preferredExcelPath) {
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

function formatScore(value) {
  return Number(value || 0).toFixed(2);
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
