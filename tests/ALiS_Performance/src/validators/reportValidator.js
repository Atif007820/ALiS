import { existsSync, statSync } from 'fs';
import ExcelJS from 'exceljs';

export async function validateGeneratedWorkbook(filePath, requiredSheets = []) {
  if (!existsSync(filePath)) {
    throw new Error(`Generated workbook does not exist: ${filePath}`);
  }

  const size = statSync(filePath).size;
  if (size === 0) {
    throw new Error(`Generated workbook is empty: ${filePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
  const missingSheets = requiredSheets.filter((sheet) => !sheetNames.includes(sheet));

  if (missingSheets.length > 0) {
    throw new Error(`Generated workbook is missing required sheets: ${missingSheets.join(', ')}`);
  }

  return {
    passed: true,
    filePath,
    size,
    sheetNames
  };
}
