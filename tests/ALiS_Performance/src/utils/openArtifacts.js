import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import runConfig from '../../config/runsettings.json' with { type: 'json' };

export async function openGeneratedReports({
  excelPath,
  playwrightReportPath
}, options = {}) {
  const config = {
    openExcel: runConfig.openExcelReport,
    openPlaywright: runConfig.openPlaywrightReport,
    ...options
  };

  if (config.openExcel && excelPath && await fileExists(excelPath)) {
    await openFile(excelPath);
  }

  if (config.openPlaywright && playwrightReportPath && await fileExists(playwrightReportPath)) {
    await openFile(playwrightReportPath, {
      cacheBust: true,
      browser: 'chrome'
    });
  }
}

async function fileExists(filePath) {
  return fs.access(filePath)
    .then(() => true)
    .catch(() => false);
}

export async function openFile(filePath, { cacheBust = false, browser } = {}) {
  const target = cacheBust ? `${pathToFileURL(path.resolve(filePath)).href}?v=${Date.now()}` : path.resolve(filePath);
  const child = spawnOpenCommand(target, { browser });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Unable to open generated artifact: ${target}`));
        return;
      }
      resolve();
    });
  });
}

function spawnOpenCommand(target, { browser } = {}) {
  if (process.platform === 'win32') {
    const escapedTarget = String(target).replaceAll("'", "''");
    const chromePath = browser === 'chrome' ? findChromeExecutable() : '';
    const escapedApplication = String(chromePath).replaceAll("'", "''");
    const command = chromePath
      ? `$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${escapedApplication}' -ArgumentList '${escapedTarget}'`
      : `$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${escapedTarget}'`;
    const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
    return spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', encodedCommand
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  return spawn(command, [target], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function findChromeExecutable() {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}
