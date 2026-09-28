import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export async function openGeneratedReports({ excelPath, htmlPath }, logger = console, {
  openHtml = true,
  openExcel = true,
} = {}) {
  const targets = [];

  if (openHtml && htmlPath && await fileExists(htmlPath)) {
    // Playwright serves the one consolidated index.html and opens it once.
    const child = spawn(process.execPath, [
      require.resolve('@playwright/test/cli'), 'show-report', path.dirname(htmlPath), '--host', '127.0.0.1',
    ], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', (error) => logger.warn?.(`Unable to open report: ${error.message}`));
    child.unref();
  }

  if (openExcel && excelPath && await fileExists(excelPath)) {
    targets.push(excelPath);
  }

  for (const target of targets) {
    openFile(target, logger);
  }
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
