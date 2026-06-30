import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { normalizeText } from './text.js';

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class ExcelManager {
  constructor({ baselineDir = path.join(frameworkRoot, 'baselines') } = {}) {
    this.baselineDir = baselineDir;
    this.workbookCache = new Map();
  }

  getBaselinePath({ businessUnit, baselineOverride, flow }) {
    if (baselineOverride) {
      return path.resolve(baselineOverride);
    }

    const baselineType = baselineTypeForFlow(flow);
    const configuredPath = path.isAbsolute(businessUnit.baselineFile)
      ? businessUnit.baselineFile
      : path.join(this.baselineDir, businessUnit.baselineFile);

    const flowUrlFolderPath = baselineType && businessUnit.urlKey && !path.isAbsolute(businessUnit.baselineFile)
      ? path.join(this.baselineDir, baselineType, businessUnit.urlKey, businessUnit.baselineFile)
      : '';

    const flowFolderPath = baselineType && !path.isAbsolute(businessUnit.baselineFile)
      ? path.join(this.baselineDir, baselineType, businessUnit.baselineFile)
      : '';

    const urlFolderPath = businessUnit.urlKey && !path.isAbsolute(businessUnit.baselineFile)
      ? path.join(this.baselineDir, businessUnit.urlKey, businessUnit.baselineFile)
      : '';

    if (flowUrlFolderPath && fs.existsSync(flowUrlFolderPath)) {
      return flowUrlFolderPath;
    }

    if (flowFolderPath && fs.existsSync(flowFolderPath)) {
      return flowFolderPath;
    }

    if (urlFolderPath && fs.existsSync(urlFolderPath)) {
      return urlFolderPath;
    }

    if (fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const legacyBaselinePath = path.join(frameworkRoot, 'BU Sheets', businessUnit.baselineFile);
    if (fs.existsSync(legacyBaselinePath)) {
      return legacyBaselinePath;
    }

    const frameworkRootPath = path.join(frameworkRoot, businessUnit.baselineFile);
    if (fs.existsSync(frameworkRootPath)) {
      return frameworkRootPath;
    }

    return flowUrlFolderPath || flowFolderPath || configuredPath;
  }

  async readBaselineRows({ businessUnit, sheetName, baselineOverride, flow }) {
    const baselinePath = this.getBaselinePath({ businessUnit, baselineOverride, flow });

    if (!fs.existsSync(baselinePath)) {
      throw new Error(`Baseline file not found: ${baselinePath}`);
    }

    const workbook = await this.readWorkbook(baselinePath);

    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found in ${baselinePath}`);
    }

    const headers = this.readHeaders(worksheet);
    const rows = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const item = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        const value = normalizeText(row.getCell(index + 1).value);
        item[header] = value;
        hasValue = hasValue || Boolean(value);
      });

      if (hasValue) {
        rows.push(item);
      }
    });

    return {
      baselinePath,
      rows,
    };
  }

  async readWorkbook(baselinePath) {
    const cacheKey = path.resolve(baselinePath);
    const cached = this.workbookCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(cacheKey);
    this.workbookCache.set(cacheKey, workbook);
    return workbook;
  }

  readHeaders(worksheet) {
    const headerRow = worksheet.getRow(1);
    const headers = [];

    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const header = normalizeText(cell.value);
      if (header) {
        headers.push(header);
      }
    });

    if (!headers.length) {
      throw new Error(`No headers found in sheet "${worksheet.name}". Expected headers in row 1.`);
    }

    return headers;
  }
}

function baselineTypeForFlow(flow) {
  const flowId = String(flow || '').trim();

  if (flowId === '3' || flowId === '4') {
    return 'View';
  }

  return 'Modify';
}
