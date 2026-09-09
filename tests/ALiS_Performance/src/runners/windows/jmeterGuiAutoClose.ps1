[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedTitle,

  [Parameter(Mandatory = $true)]
  [string]$LogPath,

  [string]$LoadedScriptPath = '',

  [int]$DialogTimeoutMs = 10000,
  [int]$ProcessExitTimeoutMs = 5000,
  [int]$MaxAttempts = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class JMeterGuiClose
{
    private const uint BM_CLICK = 0x00F5;
    private const uint GW_OWNER = 4;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint WM_CLOSE = 0x0010;
    private const int SW_RESTORE = 9;
    private const ushort VK_ESCAPE = 0x1B;
    private const ushort VK_MENU = 0x12;
    private const ushort VK_N = 0x4E;
    private const ushort VK_SPACE = 0x20;
    private const ushort VK_TAB = 0x09;

    private delegate bool EnumWindowsProc(IntPtr windowHandle, IntPtr parameter);
    private delegate bool EnumChildWindowsProc(IntPtr windowHandle, IntPtr parameter);

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
    private static extern bool EnumChildWindows(IntPtr parent, EnumChildWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr windowHandle, uint command);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr windowHandle, StringBuilder text, int maxLength);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, IntPtr processId);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr windowHandle, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint inputCount, INPUT[] inputs, int inputSize);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr windowHandle, int command);

    public static bool Close(IntPtr windowHandle)
    {
        return windowHandle != IntPtr.Zero && PostMessage(windowHandle, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }

    public static string GetTitle(IntPtr windowHandle)
    {
        var title = new StringBuilder(512);
        GetWindowText(windowHandle, title, title.Capacity);
        return title.ToString();
    }

    public static IntPtr FindOwnedDialog(uint expectedProcessId, IntPtr mainWindowHandle)
    {
        IntPtr namedSaveDialog = IntPtr.Zero;
        IntPtr ownedDialog = IntPtr.Zero;

        EnumWindows((windowHandle, _) =>
        {
            uint processId;
            GetWindowThreadProcessId(windowHandle, out processId);
            if (processId != expectedProcessId || windowHandle == mainWindowHandle || !IsWindowVisible(windowHandle))
            {
                return true;
            }

            var title = GetTitle(windowHandle);
            if (string.Equals(title, "Save?", StringComparison.OrdinalIgnoreCase))
            {
                namedSaveDialog = windowHandle;
                return false;
            }

            if (ownedDialog == IntPtr.Zero && IsOwnedBy(windowHandle, mainWindowHandle))
            {
                ownedDialog = windowHandle;
            }
            return true;
        }, IntPtr.Zero);

        return namedSaveDialog != IntPtr.Zero ? namedSaveDialog : ownedDialog;
    }

    public static bool ClickNativeNo(IntPtr dialogHandle)
    {
        IntPtr noButton = IntPtr.Zero;
        EnumChildWindows(dialogHandle, (windowHandle, _) =>
        {
            var text = GetTitle(windowHandle).Replace("&", "").Trim();
            if (string.Equals(text, "No", StringComparison.OrdinalIgnoreCase))
            {
                noButton = windowHandle;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        return noButton != IntPtr.Zero && PostMessage(noButton, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
    }

    public static bool SendNoSelection(IntPtr dialogHandle)
    {
        if (!Focus(dialogHandle)) return false;

        // A fresh JOptionPane focuses Yes; Tab selects No and Space activates it.
        if (!SendKeys(new[] { VK_TAB })) return false;
        Thread.Sleep(350);
        return SendKeys(new[] { VK_SPACE });
    }

    public static bool SendNoMnemonic(IntPtr dialogHandle)
    {
        if (!Focus(dialogHandle)) return false;

        var inputs = new[]
        {
            KeyboardInput(VK_MENU, 0),
            KeyboardInput(VK_N, 0),
            KeyboardInput(VK_N, KEYEVENTF_KEYUP),
            KeyboardInput(VK_MENU, KEYEVENTF_KEYUP)
        };
        return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) == (uint)inputs.Length;
    }

    public static bool DismissDialog(IntPtr dialogHandle)
    {
        if (!Focus(dialogHandle)) return Close(dialogHandle);
        return SendKeys(new[] { VK_ESCAPE });
    }

    private static bool IsOwnedBy(IntPtr windowHandle, IntPtr expectedOwner)
    {
        var owner = GetWindow(windowHandle, GW_OWNER);
        while (owner != IntPtr.Zero)
        {
            if (owner == expectedOwner) return true;
            owner = GetWindow(owner, GW_OWNER);
        }
        return false;
    }

    private static bool Focus(IntPtr windowHandle)
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

    private static bool SendKeys(ushort[] virtualKeys)
    {
        var inputs = new INPUT[virtualKeys.Length * 2];
        for (var index = 0; index < virtualKeys.Length; index++)
        {
            inputs[index * 2] = KeyboardInput(virtualKeys[index], 0);
            inputs[index * 2 + 1] = KeyboardInput(virtualKeys[index], KEYEVENTF_KEYUP);
        }
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

function Test-JMeterFinished {
  if (-not (Test-Path -LiteralPath $LogPath)) {
    return $false
  }

  return [bool](
    (Select-String -LiteralPath $LogPath -SimpleMatch 'Notifying test listeners of end of test' -Quiet) -or
    (Select-String -LiteralPath $LogPath -SimpleMatch 'setRunning(false, *local*)' -Quiet)
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

function Test-ProcessExited([int]$ProcessId) {
  return -not [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Wait-ForProcessExit([int]$ProcessId, [int]$TimeoutMs) {
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  while ((Get-Date) -lt $deadline) {
    if (Test-ProcessExited $ProcessId) {
      return $true
    }
    Start-Sleep -Milliseconds 200
  }
  return (Test-ProcessExited $ProcessId)
}

function Wait-ForExitDialog([int]$ProcessId, [IntPtr]$MainWindowHandle) {
  $deadline = (Get-Date).AddMilliseconds($DialogTimeoutMs)
  while ((Get-Date) -lt $deadline) {
    if (Test-ProcessExited $ProcessId) {
      return [IntPtr]::Zero
    }

    $dialog = [JMeterGuiClose]::FindOwnedDialog([uint32]$ProcessId, $MainWindowHandle)
    if ($dialog -ne [IntPtr]::Zero) {
      return $dialog
    }
    Start-Sleep -Milliseconds 200
  }
  return [IntPtr]::Zero
}

function Assert-RuntimeScriptWasNotSaved {
  if (-not $initialScriptState) {
    return
  }

  if (-not (Test-Path -LiteralPath $LoadedScriptPath)) {
    throw "The runtime JMX disappeared before no-save exit could be verified: $LoadedScriptPath"
  }

  $currentScript = Get-Item -LiteralPath $LoadedScriptPath
  if (
    $currentScript.LastWriteTimeUtc.Ticks -ne $initialScriptState.LastWriteTimeUtc.Ticks -or
    $currentScript.Length -ne $initialScriptState.Length
  ) {
    throw "JMeter modified the runtime JMX while closing; No selection could not be verified: $LoadedScriptPath"
  }
}

$initialScriptState = if ($LoadedScriptPath -and (Test-Path -LiteralPath $LoadedScriptPath)) {
  Get-Item -LiteralPath $LoadedScriptPath
} else {
  $null
}

$target = $null
while (-not $target) {
  $target = Find-JMeterProcess
  if (-not $target) {
    Start-Sleep -Milliseconds 500
  }
}

$targetProcessId = [int]$target.Id
$mainWindowHandle = [IntPtr]$target.MainWindowHandle
Write-Output "JMeter GUI auto-close is monitoring process $targetProcessId."

while (-not (Test-JMeterFinished)) {
  if (Test-ProcessExited $targetProcessId) {
    Write-Output 'JMeter GUI exited before auto-close was required.'
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

$closeMutex = New-Object System.Threading.Mutex($false, 'ALiSPerformanceJMeterGuiClose')
try {
  $mutexAcquired = $closeMutex.WaitOne(30000)
  if (-not $mutexAcquired) {
    throw 'Timed out waiting for the JMeter GUI auto-close lock.'
  }

  try {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
      if (Test-ProcessExited $targetProcessId) {
        Assert-RuntimeScriptWasNotSaved
        Write-Output 'JMeter GUI auto-close completed.'
        exit 0
      }

      [void][JMeterGuiClose]::Close($mainWindowHandle)
      $dialog = Wait-ForExitDialog $targetProcessId $mainWindowHandle

      if (Test-ProcessExited $targetProcessId) {
        Assert-RuntimeScriptWasNotSaved
        Write-Output 'JMeter GUI auto-close completed without a save prompt.'
        exit 0
      }

      if ($dialog -eq [IntPtr]::Zero) {
        Write-Output "No exit dialog was detected after close attempt $attempt."
        continue
      }

      $dialogTitle = [JMeterGuiClose]::GetTitle($dialog)
      Write-Output "JMeter exit dialog detected: '$dialogTitle'. Selecting No."

      $selectionSent = [JMeterGuiClose]::ClickNativeNo($dialog)
      if (-not $selectionSent) {
        $selectionSent = if ($attempt -eq 1) {
          [JMeterGuiClose]::SendNoSelection($dialog)
        } else {
          [JMeterGuiClose]::SendNoMnemonic($dialog)
        }
      }

      if ($selectionSent -and (Wait-ForProcessExit $targetProcessId $ProcessExitTimeoutMs)) {
        Assert-RuntimeScriptWasNotSaved
        Write-Output 'JMeter GUI auto-close completed; No was selected.'
        exit 0
      }

      $remainingDialog = [JMeterGuiClose]::FindOwnedDialog([uint32]$targetProcessId, $mainWindowHandle)
      if ($remainingDialog -ne [IntPtr]::Zero) {
        [void][JMeterGuiClose]::DismissDialog($remainingDialog)
        Start-Sleep -Milliseconds 500
      }
    }
  }
  finally {
    if ($mutexAcquired) {
      $closeMutex.ReleaseMutex()
    }
  }
}
finally {
  $closeMutex.Dispose()
}

# The test has fully ended. This last resort is equivalent to selecting No and
# guarantees that a localized or changed Swing dialog cannot block automation.
if (-not (Test-ProcessExited $targetProcessId)) {
  Stop-Process -Id $targetProcessId -Force -ErrorAction Stop
  if (-not (Wait-ForProcessExit $targetProcessId $ProcessExitTimeoutMs)) {
    throw "JMeter process $targetProcessId did not exit after the no-save fallback."
  }
  Assert-RuntimeScriptWasNotSaved
  Write-Output 'JMeter GUI was closed without saving by the process-scoped fallback.'
}
