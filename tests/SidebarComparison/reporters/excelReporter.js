import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { categoryGroups, DETAIL_COLUMNS, formatReportDateTime, REPORT_CATEGORIES, REPORT_THEME } from './reportData.js';

const identityColumns = [
  ['Site', 'site', 12], ['Product ID', 'productId', 12], ['Product', 'productName', 26],
];
const borderColor = `FF${REPORT_THEME.grid}`;
const headingColor = `FF${REPORT_THEME.headerAccent}`;
const headerFillColor = `FF${REPORT_THEME.headerBg}`;

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export async function writeExcelReport(report, { reportDir }) {
  await fs.mkdir(reportDir, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SidebarComparison';
  workbook.created = new Date(report.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;
  const overview = workbook.addWorksheet('Run Summary', { views: [{ showGridLines: false }] });
  overview.properties.tabColor = { argb: headingColor };

  const comparisons = report.comparisons.map((record) => ({
    ...record,
    executionStatus: displayExecutionStatus(record.executionStatus),
    expected: record.capturedA ? record.itemsA.length : null,
    actual: record.capturedB ? record.itemsB.length : null,
    textMatched: record.comparisonComplete ? record.matched.length + record.iconMismatch.length : null,
    missingCount: record.comparisonComplete ? record.missing.length : null,
    iconCount: record.comparisonComplete ? record.iconMismatch.length : null,
    extraCount: record.comparisonComplete ? record.extraB.length : null,
    attemptCount: record.attempts.length,
    seconds: record.durationMs / 1000,
  }));
  const comparisonSheet = tableSheet(workbook, 'Comparisons', [
    ...identityColumns, ['Execution', 'executionStatus', 16],
    ['URL A count', 'expected', 13], ['URL B count', 'actual', 13], ['Text matched', 'textMatched', 15],
    ['Missing / text mismatch', 'missingCount', 23], ['Icon mismatch', 'iconCount', 17], ['Extra', 'extraCount', 12],
    ['Attempts', 'attemptCount', 12], ['Duration (s)', 'seconds', 15],
    ['URL A', 'urlA', 65], ['URL B', 'urlB', 65],
  ], comparisons, 'Final comparison results. Blank counts mean capture or comparison was unavailable.');

  const groupedComparisons = report.comparisons.map((record) => ({ record, groups: categoryGroups(record) }));
  REPORT_CATEGORIES.forEach((category, index) => addCategorySheet(workbook, category, index, groupedComparisons));
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
  addOverview(overview, report, comparisonSheet);

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
  addTitle(sheet, name, note, columns.length);
  sheet.getRow(5).values = columns.map(([label]) => label);
  for (const data of rows) sheet.addRow(data);
  styleTable(sheet, 5, Math.max(5, sheet.rowCount), columns.length);
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }];
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: columns.length } };
  const statusIndex = columns.findIndex(([, key]) => key === 'status' || key === 'category');
  if (statusIndex >= 0 && rows.length) addStatusRules(sheet, statusIndex + 1, 6, sheet.rowCount);
  const secondsIndex = columns.findIndex(([, key]) => key === 'seconds');
  if (secondsIndex >= 0) sheet.getColumn(secondsIndex + 1).numFmt = '0.0';
  printLayout(sheet, columns.length, '1:5');
  return sheet;
}

function addCategorySheet(workbook, category, categoryIndex, comparisons) {
  const sheet = workbook.addWorksheet(category.sheetName);
  sheet.columns = DETAIL_COLUMNS.map(({ key, width }) => ({ key, width }));
  sheet.properties.tabColor = { argb: `FF${category.color}` };
  addTitle(sheet, category.sheetTitle || category.title, category.collapsible
    ? 'Matching text, including items whose icons differ.'
    : `${comparisons.reduce((total, item) => total + item.groups[categoryIndex].rows.length, 0)} item(s) across ${comparisons.length} comparison(s).`, DETAIL_COLUMNS.length);
  let nextRow = 5;
  for (const [index, { record, groups }] of comparisons.entries()) {
    const { rows } = groups[categoryIndex];
    sheet.mergeCells(nextRow, 1, nextRow, DETAIL_COLUMNS.length);
    const heading = sheet.getCell(nextRow, 1);
    heading.value = `${record.site} / ${record.productId}. ${record.productName}`;
    heading.font = { name: 'Arial', size: 11, bold: true, color: { argb: `FF${REPORT_THEME.headerText}` } };
    heading.fill = fill(headerFillColor);
    heading.alignment = { vertical: 'middle', wrapText: true };
    heading.border = { top: { style: 'thin', color: { argb: borderColor } }, bottom: { style: 'thin', color: { argb: borderColor } }, left: { style: 'medium', color: { argb: `FF${category.color}` } } };
    sheet.getRow(nextRow).height = Math.max(28, Math.ceil(heading.value.length / 130) * 16 + 8);
    const headerRow = nextRow + 1;
    sheet.getRow(headerRow).values = DETAIL_COLUMNS.map((column) => column.label);
    if (rows.length) {
      sheet.addTable({
        name: `Category${categoryIndex + 1}Comparison${index + 1}`,
        ref: `A${headerRow}`, headerRow: true, totalsRow: false,
        style: { theme: null, showRowStripes: false },
        columns: DETAIL_COLUMNS.map((column) => ({ name: column.label, filterButton: true })),
        rows: rows.map((row) => DETAIL_COLUMNS.map((column) => column.key === 'menuCategory'
          ? `${row.title}\n${category.rowLabel || row.category}`
          : row[column.key] || (column.key.endsWith('Icon') ? '(none)' : null))),
      });
      styleTable(sheet, headerRow, headerRow + rows.length, DETAIL_COLUMNS.length);
      addStatusRules(sheet, 1, headerRow + 1, headerRow + rows.length, true, category.highlightCategories);
      nextRow = headerRow + rows.length + 2;
    } else {
      styleTable(sheet, headerRow, headerRow, DETAIL_COLUMNS.length);
      const messageRow = headerRow + 1;
      sheet.mergeCells(messageRow, 1, messageRow, DETAIL_COLUMNS.length);
      const cell = sheet.getCell(messageRow, 1);
      cell.value = record.comparisonComplete ? 'None.' : `Comparison unavailable (${record.executionStatus}). See Execution Errors.`;
      cell.font = { name: 'Arial', size: 10, italic: true, color: { argb: record.comparisonComplete ? 'FF657180' : 'FF9B2525' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: borderColor } } };
      sheet.getRow(messageRow).height = 26;
      nextRow = messageRow + 2;
    }
  }
  if (!comparisons.length) sheet.getCell('A5').value = 'No comparisons were available.';
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }];
  printLayout(sheet, DETAIL_COLUMNS.length, '1:3');
}

function addTitle(sheet, title, note, columns) {
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell('A2').value = title;
  sheet.getCell('A2').fill = fill(headerFillColor);
  sheet.getCell('A2').font = { name: 'Arial', size: 16, bold: true, color: { argb: `FF${REPORT_THEME.headerText}` } };
  sheet.getCell('A2').alignment = { vertical: 'middle', wrapText: true };
  sheet.getCell('A2').border = { bottom: { style: 'medium', color: { argb: headingColor } } };
  sheet.getRow(2).height = 32;
  sheet.mergeCells(3, 1, 3, columns);
  sheet.getCell('A3').value = note;
  sheet.getCell('A3').fill = fill(headerFillColor);
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF596273' } };
  sheet.getCell('A3').alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(3).height = 27;
}

function printLayout(sheet, columns, titles) {
  sheet.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: titles, printArea: `A1:${sheet.getColumn(columns).letter}${sheet.rowCount}`,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
  };
  sheet.headerFooter.oddFooter = '&LSidebar Comparison Report&RPage &P of &N';
}

function addOverview(sheet, report, comparisonSheet) {
  sheet.columns = [16, 14, 14, 16, 14, 14, 14, 23, 18, 14].map((width) => ({ width }));
  addTitle(sheet, 'Sidebar Comparison Report', `Generated: ${formatReportDateTime(report.generatedAt)}`, 10);
  sheet.getCell('A3').value = {
    richText: [
      { text: 'Generated: ', font: { name: 'Arial', size: 10, italic: true, color: { argb: 'FF596273' } } },
      { text: formatReportDateTime(report.generatedAt), font: { name: 'Arial', size: 10, bold: true, italic: true, color: { argb: 'FF596273' } } },
    ],
  };
  sheet.getCell('A5').value = 'Execution'; sheet.getCell('B5').value = displayExecutionStatus(report.executionStatus);
  sheet.getCell('G5').value = 'Duration (s)'; sheet.getCell('H5').value = report.durationMs / 1000;
  sheet.getCell('H5').numFmt = '0.0';
  sheet.getCell('A6').value = 'Sites'; sheet.getCell('B6').value = report.sites.length;
  sheet.getCell('D6').value = 'Comparisons'; sheet.getCell('E6').value = report.summary.total;
  sheet.getCell('G6').value = 'Global errors'; sheet.getCell('H6').value = report.globalErrors.length;
  sheet.getRow(9).values = ['Site', 'Comparisons', 'Matched', 'Differences', 'Errors', 'Skipped', 'Not run', 'Missing / text mismatch', 'Icon mismatch', 'Extra'];
  const end = Math.max(6, comparisonSheet.rowCount);
  const range = (key) => {
    const column = comparisonSheet.getColumn(key).letter;
    return `'Comparisons'!$${column}$6:$${column}$${end}`;
  };
  const siteRange = range('site');
  for (const [index, site] of report.sites.entries()) {
    const row = index + 10;
    sheet.getCell(row, 1).value = site.site;
    sheet.getCell(row, 2).value = { formula: `COUNTIFS(${siteRange},$A${row})`, result: site.total };
    // Run outcomes come from the reporter; no hidden replacement status column.
    [site.matched, site.differences, site.errors, site.skipped, site.notRun].forEach((count, offset) => {
      sheet.getCell(row, offset + 3).value = count;
    });
    for (const [offset, [key, count]] of [['missingCount', site.missing], ['iconCount', site.iconMismatch], ['extraCount', site.extra]].entries()) {
      sheet.getCell(row, offset + 8).value = { formula: `SUMIFS(${range(key)},${siteRange},$A${row})`, result: count };
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
  sheet.getRow(totalRow).eachCell((cell) => {
    cell.fill = fill(headerFillColor);
    cell.border = { ...cell.border, top: { style: 'medium', color: { argb: headingColor } } };
  });
  for (const row of [3, 5, 6]) sheet.getRow(row).font = { name: 'Arial', size: 10 };
  sheet.getCell(totalRow + 2, 1).value = 'DIFFERENCES means menu content differs. ERROR means comparison could not complete. See Comparisons for URLs and Execution Errors for failures.';
  sheet.mergeCells(totalRow + 2, 1, totalRow + 2, 10);
  sheet.getCell(totalRow + 2, 1).font = { name: 'Arial', size: 10, italic: true };
  sheet.getCell(totalRow + 2, 1).alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(totalRow + 2).height = 30;
  sheet.views = [{ showGridLines: false }];
  printLayout(sheet, 10, '1:9');
  addOverviewMetadataFrame(sheet);
}

function addOverviewMetadataFrame(sheet) {
  sheet.unMergeCells('A3:J3');
  sheet.mergeCells('A3:I3');
  const color = headingColor;
  const gridColor = borderColor;
  const pairs = [['A5', 'B5'], ['G5', 'H5'], ['A6', 'B6'], ['D6', 'E6'], ['G6', 'H6']];

  for (const [labelAddress, valueAddress] of pairs) {
    const label = sheet.getCell(labelAddress);
    const value = sheet.getCell(valueAddress);
    label.fill = fill(headerFillColor);
    label.font = { name: 'Arial', size: 10, bold: true, color: { argb: headingColor } };
    label.alignment = { vertical: 'middle', horizontal: 'left' };
    value.font = { name: 'Arial', size: 10, bold: true, color: { argb: `FF${REPORT_THEME.headerText}` } };
    value.alignment = { vertical: 'middle', horizontal: 'right' };
    for (const cell of [label, value]) {
      cell.border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [
        side, { style: 'thin', color: { argb: gridColor } },
      ]));
    }
  }

  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 26;
  sheet.getRow(6).height = 26;
  sheet.getRow(7).height = 8;
  for (let row = 3; row <= 7; row++) {
    for (let column = 1; column <= 9; column++) {
      const cell = sheet.getCell(row, column);
      const border = { ...cell.border };
      if (row === 3) border.top = { style: 'medium', color: { argb: color } };
      if (row === 7) border.bottom = { style: 'medium', color: { argb: color } };
      if (column === 1) border.left = { style: 'medium', color: { argb: color } };
      if (column === 9) border.right = { style: 'medium', color: { argb: color } };
      cell.border = border;
    }
  }
}

function displayExecutionStatus(status) {
  return status === 'passed' ? 'Passed' : status;
}

function styleTable(sheet, header, last, columnCount) {
  for (let rowIndex = header; rowIndex <= last; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    let lines = 1;
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      cell.font = { name: 'Arial', size: 10, ...(rowIndex === header ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}) };
      cell.alignment = { vertical: rowIndex === header ? 'middle' : 'top', wrapText: true, horizontal: rowIndex === header ? 'center' : typeof cell.value === 'number' || cell.value?.formula ? 'right' : 'left' };
      cell.border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, { style: 'thin', color: { argb: rowIndex === header ? 'FFE2EBE6' : borderColor } }]));
      if (rowIndex === header) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headingColor } };
      } else if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } };
      }
      const width = sheet.getColumn(column).width || 12;
      const textLines = String(cell.value?.formula ? cell.value.result : cell.value ?? '').split('\n');
      lines = Math.max(lines, textLines.reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / Math.max(8, width - 3))), 0));
    }
    row.height = Math.min(400, Math.max(rowIndex === header ? 32 : 24, lines * 14 + 8));
  }
}

function addStatusRules(sheet, column, first, last, categoryInLastLine = false, highlightCategories) {
  const letter = sheet.getColumn(column).letter;
  const colors = {
    MATCHED: ['FFE6F2EA', 'FF24633D'], 'TEXT MATCHED': ['FFE6F2EA', 'FF24633D'],
    ERROR: ['FFFBE4E4', 'FF9B2525'], MISSING: ['FFFBE4E4', 'FF9B2525'],
    'TEXT MISMATCH': ['FFFBE4E4', 'FF9B2525'], 'ICON MISMATCH': ['FFFFF1D4', 'FF805A14'],
    EXTRA: ['FFE5EEF9', 'FF315C8C'], SKIPPED: ['FFECEEF1', 'FF535E6A'], 'NOT RUN': ['FFECEEF1', 'FF535E6A'],
  };
  sheet.addConditionalFormatting({
    ref: `${letter}${first}:${letter}${last}`,
    rules: Object.entries(colors).filter(([status]) => !highlightCategories || highlightCategories.includes(status)).map(([status, [bg, fg]]) => ({
      type: 'expression', formulae: [categoryInLastLine
        ? `RIGHT(${letter}${first},${status.length + 1})=CHAR(10)&"${status}"`
        : `${letter}${first}="${status}"`],
      style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }, font: { bold: true, color: { argb: fg } } },
    })),
  });
}
