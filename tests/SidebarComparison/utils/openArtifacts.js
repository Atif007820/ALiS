import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';

const require = createRequire(import.meta.url);

export async function openGeneratedReports({ excelPath, htmlPath }, logger = console, {
  openHtml = true,
  openExcel = true,
  label = 'Playwright report',
} = {}) {
  const targets = [];
  let html = null;

  if (openHtml && htmlPath) {
    try {
      html = await startHtmlReport(htmlPath);
      logger.log?.(`${label} available at ${html.url}`);
    } catch (error) {
      logger.warn?.(`Unable to open ${label} automatically: ${error.message}\nOpen it manually with: npx playwright show-report "${path.dirname(path.resolve(htmlPath))}"`);
    }
  }

  if (openExcel && excelPath && await fileExists(excelPath)) {
    targets.push(excelPath);
  }

  for (const target of targets) {
    openFile(target, logger);
  }
  return { html };
}

async function startHtmlReport(htmlPath) {
  await fs.access(htmlPath);
  const reportDir = path.dirname(path.resolve(htmlPath));
  return new Promise((resolve, reject) => {
    // Port 0 lets Playwright fall back to an available port if 9323 is occupied.
    const child = spawn(process.execPath, [
      require.resolve('@playwright/test/cli'), 'show-report', reportDir,
      '--host', '127.0.0.1', '--port', '0',
    ], { cwd: reportDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let settled = false;
    let output = '';
    const timer = setTimeout(() => fail(new Error('Playwright report server did not become ready within 15 seconds.')), 15000);

    const collect = (chunk) => {
      output = (output + stripVTControlCharacters(chunk.toString())).slice(-8192);
      const match = output.match(/Serving HTML report at (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      // The reporter can exit after startup; the report stays open independently.
      child.stdout.unref();
      child.stderr.unref();
      child.unref();
      resolve({ url: match[1], pid: child.pid });
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', fail);
    child.once('close', (code, signal) => fail(new Error(`Playwright show-report stopped (${signal || `exit ${code}`}).`)));

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill();
      reject(new Error(`${error.message}${output.trim() ? `\n${output.trim()}` : ''}`));
    }
  });
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
