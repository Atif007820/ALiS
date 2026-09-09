[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedTitle,

  [Parameter(Mandatory = $true)]
  [string]$LogPath,

  [int]$InitialDelayMs = 9000,
  [int]$TimeoutMs = 120000,
  [int]$VerificationTimeoutMs = 10000,
  [int]$MaxAttempts = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class JMeterGuiInput
{
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const ushort VK_CONTROL = 0x11;
    private const ushort VK_R = 0x52;
    private const int SW_RESTORE = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion data;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint flags;
        public uint time;
        public UIntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort virtualKey;
        public ushort scanCode;
        public uint flags;
        public uint time;
        public UIntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint message;
        public ushort parameterLow;
        public ushort parameterHigh;
    }

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, IntPtr processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint inputCount, INPUT[] inputs, int inputSize);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr windowHandle, int command);

    public static bool Focus(IntPtr windowHandle)
    {
        if (windowHandle == IntPtr.Zero || !IsWindow(windowHandle)) return false;

        var currentThreadId = GetCurrentThreadId();
        var targetThreadId = GetWindowThreadProcessId(windowHandle, IntPtr.Zero);
        var foregroundWindow = GetForegroundWindow();
        var foregroundThreadId = foregroundWindow == IntPtr.Zero
            ? 0
            : GetWindowThreadProcessId(foregroundWindow, IntPtr.Zero);
        var attachedToTarget = false;
        var attachedToForeground = false;

        try
        {
            if (targetThreadId != 0 && targetThreadId != currentThreadId)
            {
                attachedToTarget = AttachThreadInput(currentThreadId, targetThreadId, true);
            }
            if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId && foregroundThreadId != targetThreadId)
            {
                attachedToForeground = AttachThreadInput(currentThreadId, foregroundThreadId, true);
            }

            ShowWindowAsync(windowHandle, SW_RESTORE);
            BringWindowToTop(windowHandle);
            SetForegroundWindow(windowHandle);
            SetFocus(windowHandle);
            Thread.Sleep(350);
            return IsWindowVisible(windowHandle) && GetForegroundWindow() == windowHandle;
        }
        finally
        {
            if (attachedToForeground) AttachThreadInput(currentThreadId, foregroundThreadId, false);
            if (attachedToTarget) AttachThreadInput(currentThreadId, targetThreadId, false);
        }
    }

    public static bool SendStartShortcut(IntPtr windowHandle)
    {
        if (!Focus(windowHandle)) return false;

        var inputs = new[]
        {
            KeyboardInput(VK_CONTROL, 0),
            KeyboardInput(VK_R, 0),
            KeyboardInput(VK_R, KEYEVENTF_KEYUP),
            KeyboardInput(VK_CONTROL, KEYEVENTF_KEYUP)
        };
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) == (uint)inputs.Length;
    }

    private static INPUT KeyboardInput(ushort virtualKey, uint flags)
    {
        return new INPUT
        {
            type = INPUT_KEYBOARD,
            data = new InputUnion
            {
                keyboard = new KEYBDINPUT
                {
                    virtualKey = virtualKey,
                    scanCode = 0,
                    flags = flags,
                    time = 0,
                    extraInfo = UIntPtr.Zero
                }
            }
        };
    }
}
'@

function Test-JMeterStarted {
  if (-not (Test-Path -LiteralPath $LogPath)) {
    return $false
  }

  return [bool](
    (Select-String -LiteralPath $LogPath -SimpleMatch 'Running the test!' -Quiet) -or
    (Select-String -LiteralPath $LogPath -SimpleMatch 'setRunning(true, *local*)' -Quiet)
  )
}

function Find-JMeterProcess {
  return Get-Process -Name java, javaw -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle -match 'JMeter' -and
      $_.MainWindowTitle.IndexOf($ExpectedTitle, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
}

function Wait-ForStartConfirmation {
  $confirmationDeadline = (Get-Date).AddMilliseconds($VerificationTimeoutMs)
  while ((Get-Date) -lt $confirmationDeadline) {
    if (Test-JMeterStarted) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

$deadline = (Get-Date).AddMilliseconds($TimeoutMs)
$target = $null

while ((Get-Date) -lt $deadline) {
  if (Test-JMeterStarted) {
    Write-Output 'JMeter GUI test was already running.'
    exit 0
  }

  $target = Find-JMeterProcess
  if ($target) {
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $target) {
  throw "Unable to find the JMeter GUI window for '$ExpectedTitle' within $TimeoutMs ms."
}

Write-Output "JMeter GUI found: $($target.MainWindowTitle)"
Write-Output "Waiting $InitialDelayMs ms for the test plan and plugins to finish loading."
Start-Sleep -Milliseconds $InitialDelayMs

$startMutex = New-Object System.Threading.Mutex($false, 'ALiSPerformanceJMeterGuiStart')
try {
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if (Test-JMeterStarted) {
      Write-Output "JMeter GUI test started: $($target.MainWindowTitle)"
      exit 0
    }

    $target = Get-Process -Id $target.Id -ErrorAction SilentlyContinue
    if (-not $target -or $target.MainWindowHandle -eq 0) {
      throw 'The JMeter GUI closed before the test could be started.'
    }

    $mutexAcquired = $false
    try {
      $mutexAcquired = $startMutex.WaitOne(30000)
      if (-not $mutexAcquired) {
        throw 'Timed out waiting for the JMeter GUI auto-start lock.'
      }

      $sent = [JMeterGuiInput]::SendStartShortcut($target.MainWindowHandle)
      if (-not $sent) {
        # WScript uses the same Ctrl+R command but provides a compatibility fallback.
        $shell = New-Object -ComObject WScript.Shell
        [void][JMeterGuiInput]::Focus($target.MainWindowHandle)
        [void]$shell.AppActivate([int]$target.Id)
        Start-Sleep -Milliseconds 300
        $shell.SendKeys('^r')
      }
    }
    finally {
      if ($mutexAcquired) {
        $startMutex.ReleaseMutex()
      }
    }

    if (Wait-ForStartConfirmation) {
      Write-Output "JMeter GUI test started: $($target.MainWindowTitle)"
      exit 0
    }

    Write-Output "Start was not confirmed after attempt $attempt of $MaxAttempts; retrying."
    Start-Sleep -Milliseconds 750
  }
}
finally {
  $startMutex.Dispose()
}

throw "JMeter GUI opened, but Ctrl+R did not start the test after $MaxAttempts attempts. Log: $LogPath"
