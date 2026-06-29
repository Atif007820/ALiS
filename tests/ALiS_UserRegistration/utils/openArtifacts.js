import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function openReportArtifacts({
  excelPath = '',
  htmlPath = '',
  openExcel = true,
  openHtml = true,
} = {}) {
  const artifacts = [
    openExcel && excelPath ? ['Registration Excel Report', await copyExcelForViewing(excelPath)] : null,
    openHtml && htmlPath ? ['Playwright Test Report', htmlPath] : null,
  ].filter(Boolean);

  for (const [label, filePath] of artifacts) {
    await openFile(label, filePath, { cacheBust: label.includes('Playwright') });
  }
}

async function copyExcelForViewing(excelPath) {
  const target = path.resolve(excelPath);
  await fs.access(target);

  const tempDir = path.join(process.env.TEMP || process.env.TMP || '.', 'ALiS_UserRegistration');
  await fs.mkdir(tempDir, { recursive: true });

  const copyPath = path.join(tempDir, `latest-registration-report-view-${Date.now()}.xlsx`);
  await fs.copyFile(target, copyPath);
  return copyPath;
}

async function openFile(label, filePath, { cacheBust = false } = {}) {
  const target = path.resolve(filePath);

  try {
    await fs.access(target);
    const openTarget = cacheBust ? `${pathToFileURL(target).href}?v=${Date.now()}` : target;
    const child = spawnOpenCommand(openTarget);
    child.unref();
    console.log(`${label} opened: ${target}`);
  } catch (error) {
    console.warn(`${label} could not be opened: ${target}`);
    console.warn(error.message);
  }
}

function spawnOpenCommand(target) {
  if (process.platform === 'win32') {
    return spawn('cmd', ['/c', 'start', '', target], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  }

  if (process.platform === 'darwin') {
    return spawn('open', [target], {
      detached: true,
      stdio: 'ignore',
    });
  }

  return spawn('xdg-open', [target], {
    detached: true,
    stdio: 'ignore',
  });
}
