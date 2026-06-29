import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function openGeneratedReports({ excelPath, htmlPath }, logger = console, {
  openHtml = true,
  openExcel = true,
} = {}) {
  const targets = [];

  if (openHtml && htmlPath && await fileExists(htmlPath)) {
    targets.push(htmlPath);
  }

  if (openExcel && excelPath && await fileExists(excelPath)) {
    targets.push(await copyExcelForViewing(excelPath));
  }

  for (const target of targets) {
    openFile(target, logger);
  }
}

async function copyExcelForViewing(excelPath) {
  const parsed = path.parse(excelPath);
  const viewPath = path.join(parsed.dir, `${parsed.name}-view-${Date.now()}${parsed.ext}`);

  await fs.copyFile(excelPath, viewPath);
  return viewPath;
}

async function fileExists(filePath) {
  return fs.access(filePath)
    .then(() => true)
    .catch(() => false);
}

function openFile(filePath, logger) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', filePath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return;
    }

    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(command, [filePath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch (error) {
    logger.warn?.(`Unable to open report: ${filePath}. ${error.message}`);
  }
}
