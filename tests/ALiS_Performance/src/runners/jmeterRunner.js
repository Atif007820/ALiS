import { existsSync, statSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { paths } from '../../config/paths.js';
import { ensureDir } from '../utils/fileUtils.js';
import { formatJMeterProperties, spawnCommand } from '../utils/commandUtils.js';

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
    return Promise.race([
      guiExitPromise,
      autoClosePromise.then(() => guiExitPromise)
    ]);
  }

  return guiExitPromise;
}

function powershellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function scheduleGuiAutoStart(scriptPath, logPath, delayMs = 8000) {
  if (process.platform !== 'win32') {
    console.warn('JMeter GUI auto-start is currently supported only on Windows.');
    return Promise.resolve();
  }

  const initialDelayMs = Number(delayMs) || 8000;
  const expectedTitle = path.basename(scriptPath);
  const command = `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$initialDelayMs = ${initialDelayMs}
$timeoutMs = 60000
$expectedTitle = ${powershellString(expectedTitle)}
$logPath = ${powershellString(logPath)}
$shell = New-Object -ComObject WScript.Shell
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Runtime.InteropServices;

public static class JMeterGuiInput
{
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd, ref Point point);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extraInfo);

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    public static void RestoreAndFocus(IntPtr windowHandle)
    {
        ShowWindow(windowHandle, 9);
        BringWindowToTop(windowHandle);
        SetForegroundWindow(windowHandle);
    }

    public static void ClickStartButton(IntPtr windowHandle)
    {
        RestoreAndFocus(windowHandle);
        Thread.Sleep(500);

        // JMeter 5.6.3 standard toolbar: green Start button in client coordinates.
        var point = new Point { X = 310, Y = 39 };
        ClientToScreen(windowHandle, ref point);
        SetCursorPos(point.X, point.Y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
    }
}
'@

function Test-JMeterStarted {
  if (-not (Test-Path -LiteralPath $logPath)) {
    return $false
  }

  return [bool](Select-String -LiteralPath $logPath -SimpleMatch 'Running the test!' -Quiet)
}

$deadline = (Get-Date).AddMilliseconds($timeoutMs)

while ((Get-Date) -lt $deadline) {
  $candidates = @(Get-Process -Name java, javaw -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'JMeter' })

  $target = $candidates |
    Where-Object { $_.MainWindowTitle -like "*$expectedTitle*" } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

  if ($target) {
    [JMeterGuiInput]::RestoreAndFocus($target.MainWindowHandle)
    Start-Sleep -Milliseconds 1000
    if (-not $shell.AppActivate([int]$target.Id)) {
      Start-Sleep -Milliseconds 500
      continue
    }
    Write-Output "JMeter GUI found; waiting $initialDelayMs ms for the test plan to finish loading."
    Start-Sleep -Milliseconds $initialDelayMs
    [JMeterGuiInput]::RestoreAndFocus($target.MainWindowHandle)
    Start-Sleep -Milliseconds 1000
    if (-not $shell.AppActivate([int]$target.Id)) {
      Write-Error "JMeter GUI was found but could not be reactivated."
      exit 1
    }
    Start-Sleep -Milliseconds 500

    $startMutex = New-Object System.Threading.Mutex($false, 'ALiSPerformanceJMeterGuiStart')
    try {
      for ($attempt = 1; $attempt -le 3; $attempt++) {
        $mutexAcquired = $false
        try {
          $mutexAcquired = $startMutex.WaitOne(30000)
          if (-not $mutexAcquired) {
            throw 'Timed out waiting for the JMeter GUI auto-start lock.'
          }
          [JMeterGuiInput]::ClickStartButton($target.MainWindowHandle)
        } finally {
          if ($mutexAcquired) {
            $startMutex.ReleaseMutex()
          }
        }

        $verificationDeadline = (Get-Date).AddSeconds(5)
        while ((Get-Date) -lt $verificationDeadline) {
          if (Test-JMeterStarted) {
            Write-Output "JMeter GUI test started: $($target.MainWindowTitle)"
            exit 0
          }
          Start-Sleep -Milliseconds 250
        }

        Write-Output "JMeter start was not confirmed; retrying ($attempt/3)."
      }
    } finally {
      $startMutex.Dispose()
    }

    Write-Error "JMeter GUI opened, but the test did not start. Log: $logPath"
    exit 1
  }

  Start-Sleep -Milliseconds 500
}

Write-Error "Unable to find and activate the JMeter GUI window for '$expectedTitle'."
exit 1
`;
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');

  return new Promise((resolve, reject) => {
    const starter = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-OutputFormat', 'Text',
        '-EncodedCommand', encodedCommand
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe']
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
        reject(new Error(stderr.trim() || 'JMeter GUI auto-start failed.'));
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
  const command = `
$ErrorActionPreference = 'Stop'
$expectedTitle = ${powershellString(expectedTitle)}
$logPath = ${powershellString(logPath)}
$targetProcessId = $null
$shell = New-Object -ComObject WScript.Shell

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class JMeterGuiClose
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    private delegate bool EnumChildWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumChildWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxLength);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    public static void Close(IntPtr windowHandle)
    {
        PostMessage(windowHandle, 0x0010, IntPtr.Zero, IntPtr.Zero);
    }

    public static IntPtr FindSaveDialog(uint expectedProcessId)
    {
        IntPtr result = IntPtr.Zero;
        EnumWindows((windowHandle, _) =>
        {
            uint processId;
            GetWindowThreadProcessId(windowHandle, out processId);
            if (processId != expectedProcessId || !IsWindowVisible(windowHandle)) return true;

            var title = new StringBuilder(256);
            GetWindowText(windowHandle, title, title.Capacity);
            if (string.Equals(title.ToString(), "Save?", StringComparison.OrdinalIgnoreCase))
            {
                result = windowHandle;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }

    public static bool ClickNo(IntPtr dialogHandle)
    {
        IntPtr noButton = IntPtr.Zero;
        EnumChildWindows(dialogHandle, (windowHandle, _) =>
        {
            var text = new StringBuilder(64);
            GetWindowText(windowHandle, text, text.Capacity);
            if (string.Equals(text.ToString().Replace("&", ""), "No", StringComparison.OrdinalIgnoreCase))
            {
                noButton = windowHandle;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (noButton == IntPtr.Zero) return false;
        PostMessage(noButton, 0x00F5, IntPtr.Zero, IntPtr.Zero);
        return true;
    }

    public static void Activate(IntPtr windowHandle)
    {
        ShowWindow(windowHandle, 9);
        BringWindowToTop(windowHandle);
        SetForegroundWindow(windowHandle);
    }
}
'@

while ($true) {
  if (-not $targetProcessId) {
    $target = Get-Process -Name java, javaw -ErrorAction SilentlyContinue |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.MainWindowTitle -match 'JMeter' -and
        $_.MainWindowTitle -like "*$expectedTitle*"
      } |
      Sort-Object StartTime -Descending |
      Select-Object -First 1

    if ($target) {
      $targetProcessId = $target.Id
    }
  }

  if ($targetProcessId -and -not (Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue)) {
    exit 0
  }

  $testFinished = (Test-Path -LiteralPath $logPath) -and (
    (Select-String -LiteralPath $logPath -SimpleMatch 'Notifying test listeners of end of test' -Quiet) -or
    (Select-String -LiteralPath $logPath -SimpleMatch 'setRunning(false, *local*)' -Quiet)
  )

  if ($testFinished -and $targetProcessId) {
    $target = Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue
    if ($target) {
      [JMeterGuiClose]::Close($target.MainWindowHandle)
    }

    $closeDeadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $closeDeadline) {
      if (-not (Get-Process -Id $targetProcessId -ErrorAction SilentlyContinue)) {
        exit 0
      }

      $saveDialog = [JMeterGuiClose]::FindSaveDialog([uint32]$targetProcessId)
      if ($saveDialog -ne [IntPtr]::Zero) {
        if (-not [JMeterGuiClose]::ClickNo($saveDialog)) {
          [JMeterGuiClose]::Activate($saveDialog)
          Start-Sleep -Milliseconds 500
          $shell.SendKeys('%n')
        }
      }

      Start-Sleep -Milliseconds 500
    }

    Write-Error 'JMeter completed, but the GUI or Save dialog did not close within 20 seconds.'
    exit 1
  }

  Start-Sleep -Milliseconds 1000
}
`;
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', encodedCommand
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
    let stderr = '';

    closer.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    closer.on('error', reject);
    closer.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'JMeter GUI auto-close failed.'));
        return;
      }
      console.log('JMeter GUI auto-close completed.');
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
