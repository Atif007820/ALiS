import { existsSync, statSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { paths } from '../../config/paths.js';
import { ensureDir } from '../utils/fileUtils.js';
import { formatJMeterProperties, spawnCommand } from '../utils/commandUtils.js';

const GUI_AUTO_START_SCRIPT = fileURLToPath(new URL('./windows/jmeterGuiAutoStart.ps1', import.meta.url));
const GUI_AUTO_CLOSE_SCRIPT = fileURLToPath(new URL('./windows/jmeterGuiAutoClose.ps1', import.meta.url));

export function validateJMeterInstall(jmeterHome = paths.jmeterHome) {
  if (!existsSync(jmeterHome)) {
    throw new Error(`JMETER_HOME does not exist: ${jmeterHome}`);
  }

  const binDir = path.join(jmeterHome, 'bin');
  if (!existsSync(binDir) || !statSync(binDir).isDirectory()) {
    throw new Error(`JMeter bin folder does not exist: ${binDir}`);
  }

  const executable = process.platform === 'win32'
    ? path.join(binDir, 'jmeter.bat')
    : path.join(binDir, 'jmeter');

  if (!existsSync(executable)) {
    throw new Error(`JMeter executable does not exist: ${executable}`);
  }

  return { jmeterHome, binDir, executable };
}

export async function openJMeterGUI(options) {
  const { executable } = validateJMeterInstall(options.jmeterHome);
  if (!existsSync(options.scriptPath)) {
    throw new Error(`JMX script does not exist: ${options.scriptPath}`);
  }

  const scriptName = path.basename(options.scriptPath, path.extname(options.scriptPath));
  const guiLogPath = options.logPath || path.join(
    paths.frameworkRoot,
    'test-results',
    `${scriptName}-gui-${Date.now()}.log`
  );
  ensureDir(path.dirname(guiLogPath));
  if (options.jtlPath) {
    ensureDir(path.dirname(options.jtlPath));
  }

  const args = [
    '-j', guiLogPath,
    '-t', options.scriptPath,
    ...(options.jtlPath ? ['-l', options.jtlPath] : []),
    ...formatJMeterProperties(options.properties || {})
  ];
  const child = spawn(executable, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  const guiExitPromise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`JMeter GUI launch failed with exit code ${code}`));
        return;
      }
      resolve({ code: code ?? 0 });
    });
  });

  const autoStartPromise = options.autoStart
    ? scheduleGuiAutoStart(options.scriptPath, guiLogPath, options.autoStartDelayMs)
    : Promise.resolve();

  await Promise.race([
    autoStartPromise,
    guiExitPromise.then(() => {
      throw new Error('JMeter GUI closed before auto-start completed.');
    })
  ]);

  if (options.autoStart) {
    console.log(`JMeter GUI auto-start confirmed. Log: ${guiLogPath}`);
  }

  const autoClosePromise = options.autoClose
    ? scheduleGuiAutoClose(
      options.scriptPath,
      guiLogPath,
      options.waitForExit === false
    )
    : null;

  if (options.waitForExit === false) {
    child.unref();
    return { code: 0 };
  }

  if (autoClosePromise) {
    const [guiExitResult] = await Promise.all([guiExitPromise, autoClosePromise]);
    return guiExitResult;
  }

  return guiExitPromise;
}

function scheduleGuiAutoStart(scriptPath, logPath, delayMs = 8000) {
  if (process.platform !== 'win32') {
    console.warn('JMeter GUI auto-start is currently supported only on Windows.');
    return Promise.resolve();
  }

  const initialDelayMs = Math.max(0, Number(delayMs) || 8000);
  const timeoutMs = Math.max(120000, initialDelayMs + 60000);
  const expectedTitle = path.basename(scriptPath);

  if (!existsSync(GUI_AUTO_START_SCRIPT)) {
    return Promise.reject(new Error(`JMeter GUI auto-start helper does not exist: ${GUI_AUTO_START_SCRIPT}`));
  }

  return new Promise((resolve, reject) => {
    const starter = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-OutputFormat', 'Text',
        '-File', GUI_AUTO_START_SCRIPT,
        '-ExpectedTitle', expectedTitle,
        '-LogPath', logPath,
        '-InitialDelayMs', String(initialDelayMs),
        '-TimeoutMs', String(timeoutMs)
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    );

    let stdout = '';
    let stderr = '';
    starter.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    starter.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    starter.on('error', reject);
    starter.on('close', (code) => {
      if (code !== 0) {
        reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join('\n') || 'JMeter GUI auto-start failed.'));
        return;
      }
      console.log(stdout.trim());
      resolve();
    });
  });
}

function scheduleGuiAutoClose(scriptPath, logPath, detached = false) {
  if (process.platform !== 'win32') {
    console.warn('JMeter GUI auto-close is currently supported only on Windows.');
    return Promise.resolve();
  }

  const expectedTitle = path.basename(scriptPath);
  if (!existsSync(GUI_AUTO_CLOSE_SCRIPT)) {
    return Promise.reject(new Error(`JMeter GUI auto-close helper does not exist: ${GUI_AUTO_CLOSE_SCRIPT}`));
  }

  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-OutputFormat', 'Text',
    '-File', GUI_AUTO_CLOSE_SCRIPT,
    '-ExpectedTitle', expectedTitle,
    '-LogPath', logPath,
    '-LoadedScriptPath', scriptPath
  ];

  if (detached) {
    spawn('powershell.exe', args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const closer = spawn('powershell.exe', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    closer.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    closer.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    closer.on('error', reject);
    closer.on('close', (code) => {
      if (code !== 0) {
        reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join('\n') || 'JMeter GUI auto-close failed.'));
        return;
      }
      console.log(stdout.trim() || 'JMeter GUI auto-close completed.');
      resolve();
    });
  });
}

export async function runJMeterCLI(options) {
  const { executable } = validateJMeterInstall(options.jmeterHome);
  if (!existsSync(options.scriptPath)) {
    throw new Error(`JMX script does not exist: ${options.scriptPath}`);
  }

  ensureDir(path.dirname(options.jtlPath));
  ensureDir(path.dirname(options.logPath));
  if (options.generateHtmlReport !== false) {
    ensureDir(path.dirname(options.htmlReportDir));
  }

  const args = [
    '-n',
    '-t', options.scriptPath,
    '-l', options.jtlPath,
    '-j', options.logPath
  ];

  if (options.generateHtmlReport !== false) {
    args.push('-e', '-o', options.htmlReportDir);
  }

  args.push(...formatJMeterProperties(options.properties || {}));

  const result = await spawnCommand(executable, args);
  if (result.code !== 0) {
    const message = [
      `JMeter CLI execution failed with exit code ${result.code}.`,
      `Script: ${options.scriptPath}`,
      `Log: ${options.logPath}`,
      result.stderr ? `Stderr: ${result.stderr}` : ''
    ].filter(Boolean).join('\n');
    const error = new Error(message);
    error.result = result;
    throw error;
  }

  return result;
}

export async function generateJMeterHtmlDashboard(options) {
  const { executable } = validateJMeterInstall(options.jmeterHome);
  if (!existsSync(options.jtlPath)) {
    throw new Error(`JTL file does not exist: ${options.jtlPath}`);
  }

  ensureDir(path.dirname(options.htmlReportDir));
  ensureDir(path.dirname(options.logPath));
  const result = await spawnCommand(executable, [
    '-g', options.jtlPath,
    '-o', options.htmlReportDir,
    '-j', options.logPath
  ]);

  if (result.code !== 0) {
    throw new Error([
      `JMeter HTML report generation failed with exit code ${result.code}.`,
      `JTL: ${options.jtlPath}`,
      `Log: ${options.logPath}`,
      result.stderr ? `Stderr: ${result.stderr}` : ''
    ].filter(Boolean).join('\n'));
  }

  return result;
}
