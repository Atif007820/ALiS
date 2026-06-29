import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultReportDir = path.join(frameworkRoot, runSettings.outputDir || 'test-results');
const latestExcelFile = 'latest-report.xlsx';
const latestJsonFile = 'latest-results.json';
const defaultFont = { name: 'Arial', size: 11 };
const allBorders = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const fills = {
  PASS: 'FFC6EFCE',
  FAIL: 'FFFFC7CE',
  WARN: 'FFFFEB9C',
  HEADER: 'FF1F4E78',
};

export async function writeExcelReport(payload, { reportDir = defaultReportDir } = {}) {
  await fs.mkdir(reportDir, { recursive: true });
  await removeOldExcelReports(reportDir);

  const generatedAt = formatReportTimestamp();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SidebarComparison';
  workbook.created = new Date();

  addSummarySheet(workbook, payload, generatedAt);
  addTextMatchedSheet(workbook, payload);
  addMissingOrTextMismatchSheet(workbook, payload);
  addIconMismatchSheet(workbook, payload);
  addExtraSheet(workbook, payload);

  const excelPath = await writeWorkbookWithFallback(
    workbook,
    path.join(reportDir, latestExcelFile),
  );

  await fs.writeFile(
    path.join(reportDir, latestJsonFile),
    JSON.stringify({ generatedAt, ...toJsonPayload(payload), excelPath }, null, 2),
    'utf8',
  );

  return excelPath;
}

function addSummarySheet(workbook, payload, generatedAt) {
  const { labelA, labelB, urlA, urlB, itemsA, itemsB, matched, missing, iconMismatch, extraB, error } = payload;
  const textMatchedCount = matched.length + iconMismatch.length;
  const failedCount = missing.length + iconMismatch.length + extraB.length + (error ? 1 : 0);

  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Value', key: 'value', width: 86 },
  ];

  sheet.addRows([
    { item: 'Framework', value: 'SidebarComparison' },
    { item: 'Label A', value: labelA },
    { item: 'URL A', value: urlA },
    { item: 'Label B', value: labelB },
    { item: 'URL B', value: urlB },
    { item: 'Generated At', value: generatedAt },
    { item: 'Overall Status', value: failedCount ? 'FAILED' : 'PASSED' },
  ]);

  if (error) {
    sheet.addRow({ item: 'Execution Error', value: error });
  }

  sheet.addRow([]);
  sheet.addRow(['Test Case', 'Status', 'Expected Count', 'Actual Count', 'Matched', 'Mismatch/Missing', 'Extra']);
  sheet.addRow([
    'Text Matched',
    textMatchedCount ? 'PASS' : 'WARN',
    itemsA.length,
    itemsB.length,
    textMatchedCount,
    0,
    0,
  ]);
  sheet.addRow([
    'Missing Or Text Mismatch',
    missing.length ? 'FAIL' : 'PASS',
    itemsA.length,
    itemsB.length,
    0,
    missing.length,
    0,
  ]);
  sheet.addRow([
    'Icon Mismatch',
    iconMismatch.length ? 'FAIL' : 'PASS',
    itemsA.length,
    itemsB.length,
    0,
    iconMismatch.length,
    0,
  ]);
  sheet.addRow([
    'Extra',
    extraB.length ? 'FAIL' : 'PASS',
    itemsA.length,
    itemsB.length,
    0,
    0,
    extraB.length,
  ]);

  styleHeaderRow(sheet.getRow(1));
  const testCaseHeaderRow = error ? 11 : 10;
  styleHeaderRow(sheet.getRow(testCaseHeaderRow));
  applyStatusStyles(sheet, testCaseHeaderRow + 1, sheet.rowCount, 2);
  polishWorksheet(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addTextMatchedSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('Text Matched');
  applyTextColumns(sheet);
  const mapA = itemMap(payload.itemsA);
  const mapB = itemMap(payload.itemsB);
  const textMatchedTitles = [
    ...payload.matched,
    ...payload.iconMismatch.map((item) => item.title),
  ];

  for (const title of textMatchedTitles) {
    const expected = mapA.get(key(title));
    const actual = mapB.get(key(title));
    sheet.addRow(toSidebarRow({
      status: 'PASS',
      expected,
      actual,
      details: `Title: ${expected?.title || actual?.title || title}. Title and text matched in Expected and Actual.`,
    }));
  }

  finalizeSheet(sheet);
}

function addMissingOrTextMismatchSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('Missing Or Text Mismatch');
  applyTextColumns(sheet);
  const mapA = itemMap(payload.itemsA);
  const mapB = itemMap(payload.itemsB);

  for (const title of payload.missing) {
    const expected = mapA.get(key(title));
    const actual = mapB.get(key(title));
    const details = actual
      ? 'Title exists in Actual, but menu text does not match Expected.'
      : 'Expected menu item is missing in Actual.';
    sheet.addRow(toSidebarRow({
      status: actual ? 'MISMATCH' : 'MISSING',
      expected,
      actual,
      details: `Title: ${expected?.title || actual?.title || title}. ${details}`,
    }));
  }

  finalizeSheet(sheet);
}

function addIconMismatchSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('Icon Mismatch');
  sheet.columns = [
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Expected Icon', key: 'expectedIcon', width: 24 },
    { header: 'Actual Icon', key: 'actualIcon', width: 24 },
    { header: 'Details', key: 'details', width: 76 },
  ];

  for (const item of payload.iconMismatch) {
    sheet.addRow({
      status: 'MISMATCH',
      expectedIcon: item.iconA || '',
      actualIcon: item.iconB || '',
      details: `Title: ${item.title}. Menu title and text matched, but icon code is different.`,
    });
  }

  finalizeSheet(sheet);
}

function addExtraSheet(workbook, payload) {
  const sheet = workbook.addWorksheet('Extra');
  applyTextColumns(sheet);
  const mapB = itemMap(payload.itemsB);

  for (const title of payload.extraB) {
    const actual = mapB.get(key(title));
    sheet.addRow(toSidebarRow({
      status: 'EXTRA',
      expected: null,
      actual,
      details: `Title: ${actual?.title || title}. Actual has this menu item, but Expected does not.`,
    }));
  }

  finalizeSheet(sheet);
}

function applyTextColumns(sheet) {
  sheet.columns = [
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Expected Text', key: 'expectedText', width: 52 },
    { header: 'Actual Text', key: 'actualText', width: 52 },
    { header: 'Details', key: 'details', width: 76 },
  ];
}

function toSidebarRow({ status, expected, actual, details }) {
  return {
    status,
    expectedText: displayText(expected),
    actualText: displayText(actual),
    details,
  };
}

function displayText(item) {
  return item?.text || item?.title || '';
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

function itemMap(items) {
  return new Map(items.map((item) => [key(item.title), item]));
}

function key(value) {
  return String(value || '').trim().toLowerCase();
}

function styleHeaderRow(row) {
  row.font = { ...defaultFont, bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.HEADER } };
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
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);

    for (let colNumber = 1; colNumber <= sheet.columnCount; colNumber += 1) {
      const cell = row.getCell(colNumber);

      cell.font = {
        ...defaultFont,
        ...(cell.font || {}),
        name: defaultFont.name,
        size: defaultFont.size,
      };
      cell.alignment = {
        ...(cell.alignment || {}),
        vertical: cell.alignment?.vertical || 'top',
        wrapText: true,
      };
      cell.border = allBorders;
    }
  }
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

function toJsonPayload(payload) {
  return {
    labelA: payload.labelA,
    labelB: payload.labelB,
    urlA: payload.urlA,
    urlB: payload.urlB,
    itemsA: payload.itemsA,
    itemsB: payload.itemsB,
    matched: payload.matched,
    missing: payload.missing,
    iconMismatch: payload.iconMismatch,
    extraB: payload.extraB,
    error: payload.error || '',
  };
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
