import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { openReportArtifacts } from '../utils/openArtifacts.js';

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(frameworkRoot, 'test-results');
const htmlReportPath = path.join(frameworkRoot, 'playwright-report', 'index.html');
const htmlExcelReportPath = path.join(frameworkRoot, 'playwright-report', 'latest-registration-report.xlsx');
const htmlExcelReportUrl = pathToFileURL(htmlExcelReportPath).href;
const preferredExcelPath = path.join(reportDir, 'latest-registration-report.xlsx');
const metadataPath = path.join(reportDir, 'latest-registration-report.json');
const defaultFont = { name: 'Arial', size: 11 };
const allBorders = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};
const fills = {
  HEADER: 'FF1F4E78',
  PASS: 'FFC6EFCE',
  FAIL: 'FFFFC7CE',
  SKIPPED: 'FFD9E2F3',
  OTHER: 'FFFFEB9C',
};
const annotationColumns = [
  { header: 'Environment', key: 'environment', width: 18 },
  { header: 'Environment Key', key: 'environmentKey', width: 18 },
  { header: 'Site', key: 'site', width: 22 },
  { header: 'Site Key', key: 'siteKey', width: 16 },
  { header: 'Login URL', key: 'loginUrl', width: 56 },
  { header: 'Product', key: 'product', width: 28 },
  { header: 'Product Key', key: 'productKey', width: 18 },
  { header: 'Login Name', key: 'loginName', width: 26 },
  { header: 'Entity', key: 'entity', width: 34 },
  { header: 'Person', key: 'person', width: 24 },
  { header: 'Email', key: 'email', width: 42 },
  { header: 'Project', key: 'project', width: 16 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Outcome', key: 'outcome', width: 14 },
  { header: 'Duration (ms)', key: 'durationMs', width: 16 },
  { header: 'Test Name', key: 'testName', width: 64 },
  { header: 'Error', key: 'error', width: 72 },
];

export default class RegistrationExcelReporter {
  constructor() {
    this.rows = [];
    this.generatedAt = '';
    this.summary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      timedOut: 0,
      interrupted: 0,
    };
    this.fullResult = null;
    this.excelPath = '';
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.generatedAt = formatReportTimestamp();
    this.summary.total = suite.allTests().length;
    this.projectNames = [...new Set(config.projects.map((project) => project.name))];
  }

  onTestEnd(test, result) {
    pushResultAnnotation(result, 'Excel Report', htmlExcelReportUrl);

    const annotations = mergeAnnotations(test.annotations, result.annotations);
    const annotationMap = annotationValueMap(annotations);
    const project = test.parent.project()?.name || '';
    const row = {
      environment: annotationMap.get('environment') || '',
      environmentKey: annotationMap.get('environment key') || '',
      site: annotationMap.get('site') || '',
      siteKey: annotationMap.get('site key') || '',
      loginUrl: annotationMap.get('login url') || '',
      product: annotationMap.get('product') || '',
      productKey: annotationMap.get('product key') || '',
      loginName: annotationMap.get('login name') || '',
      entity: annotationMap.get('entity') || '',
      person: annotationMap.get('person') || '',
      email: annotationMap.get('email') || '',
      project,
      status: normalizeStatus(result.status),
      outcome: String(test.outcome() || '').toUpperCase(),
      durationMs: result.duration,
      testName: test.title,
      error: collectErrorText(result),
    };

    this.rows.push(row);
    incrementSummary(this.summary, result.status);
  }

  async onEnd(result) {
    this.fullResult = result;
    if (!this.rows.length) return;

    await fs.mkdir(reportDir, { recursive: true });
    await removeOldRegistrationReports(reportDir);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ALiS_UserRegistration';
    workbook.created = new Date();

    addSummarySheet(workbook, {
      generatedAt: this.generatedAt,
      rows: this.rows,
      summary: this.summary,
      fullResult: result,
      projectNames: this.projectNames || [],
    });
    addRegistrationResultsSheet(workbook, this.rows);
    formatWorkbook(workbook);

    this.excelPath = await writeWorkbookWithFallback(workbook, preferredExcelPath);
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        generatedAt: this.generatedAt,
        excelPath: this.excelPath,
        htmlReportPath,
        htmlExcelReportUrl,
        summary: this.summary,
        overallStatus: String(result.status || '').toUpperCase(),
        rowCount: this.rows.length,
      }, null, 2),
      'utf8',
    );
  }

  async onExit() {
    if (!this.rows.length) return;

    try {
      if (this.excelPath) {
        await copyExcelIntoPlaywrightReport(this.excelPath);
      }

      await openReportArtifacts({
        excelPath: this.excelPath,
        htmlPath: htmlReportPath,
        openExcel: asBoolean(runSettings.openExcelReport, true),
        openHtml: asBoolean(runSettings.openPlaywrightReport, true),
      });
    } catch (error) {
      console.warn(`Registration report post-processing failed: ${error.message}`);
    }
  }
}

function addSummarySheet(workbook, { generatedAt, rows, summary, fullResult, projectNames }) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Value', key: 'value', width: 80 },
  ];

  sheet.addRows([
    { item: 'Framework', value: 'ALiS_UserRegistration' },
    { item: 'Generated At', value: generatedAt },
    { item: 'Overall Status', value: normalizeStatus(fullResult?.status || '') },
    { item: 'Total Tests', value: summary.total },
    { item: 'Passed', value: summary.passed },
    { item: 'Failed', value: summary.failed },
    { item: 'Skipped', value: summary.skipped },
    { item: 'Timed Out', value: summary.timedOut },
    { item: 'Interrupted', value: summary.interrupted },
    { item: 'Projects', value: projectNames.join(', ') },
    { item: 'Rows Written', value: rows.length },
  ]);

  styleHeaderRow(sheet.getRow(1));
  applyStatusFill(sheet.getCell('B3'));
  finalizeSheet(sheet);
}

function addRegistrationResultsSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Registration Results');
  sheet.columns = annotationColumns;

  for (const row of rows) {
    sheet.addRow(row);
  }

  styleHeaderRow(sheet.getRow(1));
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    applyStatusFill(sheet.getRow(rowNumber).getCell('M'));
  }
  finalizeSheet(sheet);
}

function mergeAnnotations(...annotationLists) {
  const merged = [];
  const seen = new Set();

  for (const annotation of annotationLists.flat().filter(Boolean)) {
    const type = String(annotation.type || '').trim();
    const description = String(annotation.description || '').trim();
    const key = `${type}::${description}`;

    if (!type || seen.has(key)) continue;
    seen.add(key);
    merged.push({ type, description });
  }

  return merged;
}

function annotationValueMap(annotations) {
  const map = new Map();

  for (const annotation of annotations) {
    const key = String(annotation.type || '').trim().toLowerCase();
    const value = String(annotation.description || '').trim();
    if (!key || !value) continue;

    if (!map.has(key)) {
      map.set(key, value);
      continue;
    }

    const existing = map.get(key);
    const pieces = existing.split(' | ').map((item) => item.trim()).filter(Boolean);
    if (!pieces.includes(value)) {
      map.set(key, `${existing} | ${value}`);
    }
  }

  return map;
}

function collectErrorText(result) {
  const messages = (result.errors || [])
    .map((error) => String(error?.message || error?.value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (messages.length) {
    return [...new Set(messages)].join(' | ');
  }

  return String(result.error?.message || '').replace(/\s+/g, ' ').trim();
}

function incrementSummary(summary, status) {
  switch (status) {
    case 'passed':
      summary.passed += 1;
      break;
    case 'failed':
      summary.failed += 1;
      break;
    case 'skipped':
      summary.skipped += 1;
      break;
    case 'timedOut':
      summary.timedOut += 1;
      break;
    case 'interrupted':
      summary.interrupted += 1;
      break;
    default:
      break;
  }
}

function normalizeStatus(status) {
  const value = String(status || '').trim();
  if (!value) return '';
  if (value === 'timedOut') return 'TIMED OUT';
  return value.toUpperCase();
}

function styleHeaderRow(row) {
  row.font = { ...defaultFont, bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.HEADER } };
}

function applyStatusFill(cell) {
  const value = String(cell.value || '').toUpperCase();

  if (value.includes('PASS')) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.PASS } };
    return;
  }

  if (value.includes('FAIL') || value.includes('TIME')) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.FAIL } };
    return;
  }

  if (value.includes('SKIP')) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.SKIPPED } };
    return;
  }

  if (value) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills.OTHER } };
  }
}

function finalizeSheet(sheet) {
  polishWorksheet(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: sheet.getCell(1, sheet.columnCount).address,
  };
}

function formatWorkbook(workbook) {
  for (const sheet of workbook.worksheets) {
    polishWorksheet(sheet);
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

async function removeOldRegistrationReports(targetDir) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && /^~?\$?latest-registration-report.*\.(xlsx|json)$/i.test(entry.name))
    .map((entry) => fs.rm(path.join(targetDir, entry.name), { force: true }).catch(() => {})));
}

async function copyExcelIntoPlaywrightReport(sourcePath) {
  await fs.mkdir(path.dirname(htmlExcelReportPath), { recursive: true });
  await fs.copyFile(sourcePath, htmlExcelReportPath);
}

function pushResultAnnotation(result, type, description) {
  if (!result?.annotations) return;

  const normalizedType = String(type || '').trim();
  const normalizedDescription = String(description || '').trim();
  if (!normalizedType || !normalizedDescription) return;

  const exists = result.annotations.some((annotation) => (
    String(annotation.type || '').trim() === normalizedType
      && String(annotation.description || '').trim() === normalizedDescription
  ));

  if (!exists) {
    result.annotations.push({ type: normalizedType, description: normalizedDescription });
  }
}

async function writeWorkbookWithFallback(workbook, targetPath) {
  try {
    await workbook.xlsx.writeFile(targetPath);
    return targetPath;
  } catch (error) {
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      throw error;
    }

    const fallbackPath = path.join(
      path.dirname(targetPath),
      `latest-registration-report-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.writeFile(fallbackPath);
    return fallbackPath;
  }
}

function asBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return !/^(false|0|no)$/i.test(String(value).trim());
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
