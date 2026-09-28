import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { menuRows } from './reportData.js';

const identityColumns = [
  ['Site', 'site', 12], ['Product ID', 'productId', 12], ['Product', 'productName', 26],
  ['Browser project', 'project', 18], ['Repeat', 'repeat', 10],
];
const detailColumns = [
  ...identityColumns, ['Category', 'category', 22], ['Menu item', 'title', 40],
  ['URL A text', 'expectedText', 48], ['URL B text', 'actualText', 48],
  ['URL A icon', 'expectedIcon', 22], ['URL B icon', 'actualIcon', 22],
];

export async function writeExcelReport(report, { reportDir }) {
  await fs.mkdir(reportDir, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SidebarComparison';
  workbook.created = new Date(report.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;
  const overview = workbook.addWorksheet('Run Summary', { views: [{ showGridLines: false }] });
  overview.properties.tabColor = { argb: 'FF34495E' };

  const comparisons = report.comparisons.map((record) => ({
    ...record,
    expected: record.capturedA ? record.itemsA.length : null,
    actual: record.capturedB ? record.itemsB.length : null,
    textMatched: record.comparisonComplete ? record.matched.length + record.iconMismatch.length : null,
    missingCount: record.comparisonComplete ? record.missing.length : null,
    iconCount: record.comparisonComplete ? record.iconMismatch.length : null,
    extraCount: record.comparisonComplete ? record.extraB.length : null,
    attemptCount: record.attempts.length,
    seconds: record.durationMs / 1000,
  }));
  tableSheet(workbook, 'Comparisons', [
    ...identityColumns, ['Comparison result', 'status', 22], ['Execution', 'executionStatus', 16],
    ['URL A count', 'expected', 13], ['URL B count', 'actual', 13], ['Text matched', 'textMatched', 15],
    ['Missing / text mismatch', 'missingCount', 23], ['Icon mismatch', 'iconCount', 17], ['Extra', 'extraCount', 12],
    ['Attempts', 'attemptCount', 12], ['Duration (s)', 'seconds', 15],
    ['URL A', 'urlA', 65], ['URL B', 'urlB', 65],
  ], comparisons, 'One final comparison per site, product, browser and repeat. Blank counts mean capture/comparison was unavailable.');

  const details = report.comparisons.flatMap(menuRows);
  tableSheet(workbook, 'Differences', detailColumns, details.filter((row) => row.category !== 'MATCHED'),
    'Filter by site, product or category: MISSING, TEXT MISMATCH, ICON MISMATCH, EXTRA.');
  tableSheet(workbook, 'Matched Text', detailColumns, details.filter((row) => ['MATCHED', 'ICON MISMATCH'].includes(row.category)),
    'Text matches include ICON MISMATCH rows; their icon differences are also listed on Differences.');
  const errors = report.comparisons.flatMap((record) => [
    ...(record.error || ['SKIPPED', 'NOT RUN'].includes(record.status)
      ? [{ ...record, stage: 'Final result', attempt: record.attempts.length || null, detail: record.error || record.status }] : []),
    ...record.attempts.slice(0, -1).filter((attempt) => attempt.error).map((attempt) => ({
      ...record, stage: 'Earlier attempt', attempt: attempt.retry + 1, detail: attempt.error,
    })),
  ]);
  errors.push(...report.globalErrors.map((detail) => ({ site: '(Run)', stage: 'Global error', detail })));
  tableSheet(workbook, 'Execution Errors', [
    ...identityColumns, ['Stage', 'stage', 22], ['Attempt', 'attempt', 12], ['Details', 'detail', 110],
  ], errors, 'Runtime failures, skipped/unstarted comparisons, and earlier retry errors.');
  addOverview(overview, report, comparisons.length);

  let excelPath = path.join(reportDir, 'sidebar-comparison.xlsx');
  try {
    await workbook.xlsx.writeFile(excelPath);
  } catch (error) {
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    // Keep the current run available when the previous workbook is open in Excel.
    excelPath = path.join(reportDir, `sidebar-comparison-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(excelPath);
  }
  return excelPath;
}

function tableSheet(workbook, name, columns, rows, note) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(([, key, width]) => ({ key, width }));
  sheet.getCell('A2').value = name;
  sheet.getCell('A2').font = { name: 'Arial', size: 16, bold: true };
  sheet.getCell('A3').value = note;
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF596273' } };
  sheet.getRow(5).values = columns.map(([label]) => label);
  for (const data of rows) sheet.addRow(data);
  styleTable(sheet, 5, Math.max(5, sheet.rowCount), columns.length);
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }];
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: columns.length } };
  const statusIndex = columns.findIndex(([, key]) => key === 'status' || key === 'category');
  if (statusIndex >= 0 && rows.length) addStatusRules(sheet, statusIndex + 1, 6, sheet.rowCount);
  const secondsIndex = columns.findIndex(([, key]) => key === 'seconds');
  if (secondsIndex >= 0) sheet.getColumn(secondsIndex + 1).numFmt = '0.0';
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' };
  return sheet;
}

function addOverview(sheet, report, comparisonCount) {
  sheet.columns = [16, 14, 14, 16, 14, 14, 14, 23, 18, 14].map((width) => ({ width }));
  sheet.getCell('A2').value = 'Sidebar Comparison';
  sheet.getCell('A2').font = { name: 'Arial', size: 16, bold: true };
  sheet.getCell('A3').value = `Generated: ${new Date(report.generatedAt).toLocaleString('en-GB')}`;
  sheet.getCell('A5').value = 'Result'; sheet.getCell('B5').value = report.status;
  sheet.getCell('D5').value = 'Execution'; sheet.getCell('E5').value = report.executionStatus;
  sheet.getCell('G5').value = 'Duration (s)'; sheet.getCell('H5').value = report.durationMs / 1000;
  sheet.getCell('H5').numFmt = '0.0';
  sheet.getCell('A6').value = 'Sites'; sheet.getCell('B6').value = report.sites.length;
  sheet.getCell('D6').value = 'Comparisons'; sheet.getCell('E6').value = report.summary.total;
  sheet.getCell('G6').value = 'Global errors'; sheet.getCell('H6').value = report.globalErrors.length;
  sheet.getRow(9).values = ['Site', 'Comparisons', 'Matched', 'Differences', 'Errors', 'Skipped', 'Not run', 'Missing / text mismatch', 'Icon mismatch', 'Extra'];
  const end = Math.max(6, comparisonCount + 5);
  const siteRange = `'Comparisons'!$A$6:$A$${end}`;
  const statusRange = `'Comparisons'!$F$6:$F$${end}`;
  for (const [index, site] of report.sites.entries()) {
    const row = index + 10;
    sheet.getCell(row, 1).value = site.site;
    sheet.getCell(row, 2).value = { formula: `COUNTIFS(${siteRange},$A${row})`, result: site.total };
    for (const [offset, [status, count]] of [
      ['MATCHED', site.matched], ['DIFFERENCES', site.differences], ['ERROR', site.errors],
      ['SKIPPED', site.skipped], ['NOT RUN', site.notRun],
    ].entries()) {
      sheet.getCell(row, offset + 3).value = { formula: `COUNTIFS(${siteRange},$A${row},${statusRange},"${status}")`, result: count };
    }
    for (const [offset, [column, count]] of [['K', site.missing], ['L', site.iconMismatch], ['M', site.extra]].entries()) {
      sheet.getCell(row, offset + 8).value = { formula: `SUMIFS('Comparisons'!$${column}$6:$${column}$${end},${siteRange},$A${row})`, result: count };
    }
  }
  const totalRow = report.sites.length + 10;
  sheet.getCell(totalRow, 1).value = 'Total';
  const totals = ['total', 'matched', 'differences', 'errors', 'skipped', 'notRun', 'missing', 'iconMismatch', 'extra'];
  totals.forEach((key, index) => {
    const letter = sheet.getColumn(index + 2).letter;
    sheet.getCell(totalRow, index + 2).value = report.sites.length
      ? { formula: `SUM(${letter}10:${letter}${totalRow - 1})`, result: report.summary[key] } : 0;
  });
  styleTable(sheet, 9, totalRow, 10);
  sheet.getRow(totalRow).font = { name: 'Arial', size: 10, bold: true };
  for (const row of [3, 5, 6]) sheet.getRow(row).font = { name: 'Arial', size: 10 };
  sheet.getCell(totalRow + 2, 1).value = 'DIFFERENCES means menu content differs. ERROR means comparison could not complete. See Comparisons for URLs and Execution Errors for failures.';
  sheet.getCell(totalRow + 2, 1).font = { name: 'Arial', size: 10, italic: true };
  sheet.views = [{ showGridLines: false }];
}

function styleTable(sheet, header, last, columnCount) {
  for (let rowIndex = header; rowIndex <= last; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    let lines = 1;
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      cell.font = { name: 'Arial', size: 10, ...(rowIndex === header ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}) };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: rowIndex === header ? 'center' : typeof cell.value === 'number' || cell.value?.formula ? 'right' : 'left' };
      if (rowIndex === header) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCED4DC' } } };
      } else if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } };
      }
      const width = sheet.getColumn(column).width || 12;
      lines = Math.max(lines, ...String(cell.value?.formula ? cell.value.result : cell.value ?? '').split('\n').map((text) => Math.ceil(text.length / Math.max(8, width - 3))));
    }
    row.height = Math.min(400, Math.max(rowIndex === header ? 32 : 24, lines * 14 + 8));
  }
}

function addStatusRules(sheet, column, first, last) {
  const letter = sheet.getColumn(column).letter;
  const colors = {
    MATCHED: ['FFE6F2EA', 'FF24633D'], DIFFERENCES: ['FFFFF1D4', 'FF805A14'],
    ERROR: ['FFFBE4E4', 'FF9B2525'], MISSING: ['FFFBE4E4', 'FF9B2525'],
    'TEXT MISMATCH': ['FFFBE4E4', 'FF9B2525'], 'ICON MISMATCH': ['FFFFF1D4', 'FF805A14'],
    EXTRA: ['FFE5EEF9', 'FF315C8C'], SKIPPED: ['FFECEEF1', 'FF535E6A'], 'NOT RUN': ['FFECEEF1', 'FF535E6A'],
  };
  sheet.addConditionalFormatting({
    ref: `${letter}${first}:${letter}${last}`,
    rules: Object.entries(colors).map(([status, [bg, fg]]) => ({
      type: 'expression', formulae: [`${letter}${first}="${status}"`],
      style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, font: { bold: true, color: { argb: fg } } },
    })),
  });
}
