import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function openReportArtifacts(report, logger, {
  openExcel = true,
  openHtml = true,
} = {}) {
  const artifacts = [
    openExcel ? ['Results Excel', await copyExcelForViewing(report.excelPath)] : null,
    openHtml ? ['Baseline HTML Report', report.htmlReportPath] : null,
  ];

  for (const artifact of artifacts.filter(Boolean)) {
    const [label, filePath] = artifact;
    await openFile(label, filePath, logger);
  }
}

async function copyExcelForViewing(excelPath) {
  if (!excelPath) {
    return '';
  }

  const tempDir = path.join(process.env.TEMP || process.env.TMP || '.', 'ALiS_BusinessEntity_Baseline');
  await fs.mkdir(tempDir, { recursive: true });

  const copyPath = path.join(tempDir, `latest-report-view-${Date.now()}.xlsx`);
  await fs.copyFile(excelPath, copyPath);
  return copyPath;
}

export async function openFile(label, filePath, logger, { cacheBust = false } = {}) {
  if (!filePath) {
    return;
  }

  const target = path.resolve(filePath);

  try {
    await fs.access(target);
    const openTarget = cacheBust ? `${pathToFileURL(target).href}?v=${Date.now()}` : target;
    const child = spawnOpenCommand(openTarget);
    child.unref();
    logger.info(`${label} opened: ${target}`);
  } catch (error) {
    logger.error(`${label} could not be opened: ${target}`);
    logger.error(error.message);
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
