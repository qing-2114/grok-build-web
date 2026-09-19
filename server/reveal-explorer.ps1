$ErrorActionPreference = 'Continue'
$Target = [string]$env:GROK_REVEAL_PATH
$Target = $Target.Trim()
if (-not $Target) { exit 1 }
$Target = $Target -replace '/', '\'

$folder = $null
$fileName = $null
if (Test-Path -LiteralPath $Target -PathType Container) {
  $folder = (Resolve-Path -LiteralPath $Target).Path
} elseif (Test-Path -LiteralPath $Target -PathType Leaf) {
  $resolved = (Resolve-Path -LiteralPath $Target).Path
  $folder = [System.IO.Path]::GetDirectoryName($resolved)
  $fileName = [System.IO.Path]::GetFileName($resolved)
} else {
  $parent = [System.IO.Path]::GetDirectoryName($Target)
  if (-not $parent -or -not (Test-Path -LiteralPath $parent -PathType Container)) { exit 2 }
  $folder = (Resolve-Path -LiteralPath $parent).Path
}

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace GrokBuildWeb {
  [ComImport, Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IVirtualDesktopManager {
    [PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr hwnd, out int onCurrent);
    [PreserveSig] int GetWindowDesktopId(IntPtr hwnd, out Guid desktop);
    [PreserveSig] int MoveWindowToDesktop(IntPtr hwnd, ref Guid desktop);
  }

  [ComImport, Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
  class CVirtualDesktopManager {}

  [StructLayout(LayoutKind.Sequential)]
  struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential)]
  struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  struct WINDOWPLACEMENT {
    public int length;
    public int flags;
    public int showCmd;
    public POINT ptMinPosition;
    public POINT ptMaxPosition;
    public RECT rcNormalPosition;
  }

  public static class Native {
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr SetActiveWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr hwnd, bool fAltTab);
    [DllImport("user32.dll")] static extern bool LockSetForegroundWindow(uint uLockCode);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int dwProcessId);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnum, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT lpwndpl);
    [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT lpwndpl);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr ILCreateFromPathW(string path);
    [DllImport("shell32.dll")] static extern void ILFree(IntPtr pidl);
    [DllImport("shell32.dll")] static extern int SHOpenFolderAndSelectItems(IntPtr pidl, uint cidl, IntPtr apidl, uint flags);

    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_SHOWWINDOW = 0x0040;
    const int SW_SHOWNORMAL = 1;
    const int SW_SHOW = 5;
    const int SW_RESTORE = 9;
    const byte VK_MENU = 0x12;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint LSFW_UNLOCK = 2;
    const int ASFW_ANY = -1;
    const int DWMWA_CLOAKED = 14;

    static StringBuilder listBuf;

    public static IntPtr Foreground() { return GetForegroundWindow(); }

    public static Guid DesktopOf(IntPtr hwnd) {
      try {
        var vdm = (IVirtualDesktopManager)new CVirtualDesktopManager();
        Guid id;
        if (vdm.GetWindowDesktopId(hwnd, out id) < 0) return Guid.Empty;
        return id;
      } catch { return Guid.Empty; }
    }

    public static void MoveToDesktop(IntPtr hwnd, Guid desktop) {
      if (hwnd == IntPtr.Zero || desktop == Guid.Empty) return;
      try {
        var vdm = (IVirtualDesktopManager)new CVirtualDesktopManager();
        Guid d = desktop;
        vdm.MoveWindowToDesktop(hwnd, ref d);
      } catch { }
    }

    static bool ListCallback(IntPtr hwnd, IntPtr lParam) {
      var cls = new StringBuilder(64);
      GetClassName(hwnd, cls, cls.Capacity);
      string c = cls.ToString();
      if (c != "CabinetWClass" && c != "ExploreWClass") return true;
      var title = new StringBuilder(512);
      GetWindowText(hwnd, title, title.Capacity);
      int cloaked = 0;
      try { DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out cloaked, 4); } catch { }
      listBuf.Append((long)hwnd).Append('\t')
        .Append(title.ToString().Replace('\t', ' ').Replace('\n', ' ')).Append('\t')
        .Append(IsIconic(hwnd) ? '1' : '0').Append('\t')
        .Append(cloaked != 0 ? '1' : '0').Append('\n');
      return true;
    }

    public static string ListCabinets() {
      listBuf = new StringBuilder();
      EnumWindows(ListCallback, IntPtr.Zero);
      return listBuf.ToString();
    }

    public static void RestoreNormal(IntPtr hwnd) {
      if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return;
      var wp = new WINDOWPLACEMENT();
      wp.length = Marshal.SizeOf(typeof(WINDOWPLACEMENT));
      GetWindowPlacement(hwnd, ref wp);
      wp.showCmd = SW_SHOWNORMAL;
      wp.flags = 0;
      SetWindowPlacement(hwnd, ref wp);
      ShowWindowAsync(hwnd, SW_RESTORE);
      ShowWindow(hwnd, SW_RESTORE);
      ShowWindow(hwnd, SW_SHOW);
      ShowWindow(hwnd, SW_SHOWNORMAL);
    }

    public static bool Focus(IntPtr hwnd) {
      if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return false;
      RestoreNormal(hwnd);

      IntPtr fg = GetForegroundWindow();
      uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);
      uint thisThread = GetCurrentThreadId();
      uint hwndThread = GetWindowThreadProcessId(hwnd, IntPtr.Zero);

      try { LockSetForegroundWindow(LSFW_UNLOCK); } catch { }
      try { AllowSetForegroundWindow(ASFW_ANY); } catch { }

      bool attachedFg = false;
      bool attachedHwnd = false;
      if (fgThread != 0 && fgThread != thisThread) attachedFg = AttachThreadInput(thisThread, fgThread, true);
      if (hwndThread != 0 && hwndThread != thisThread && hwndThread != fgThread) {
        attachedHwnd = AttachThreadInput(thisThread, hwndThread, true);
      }

      BringWindowToTop(hwnd);
      SwitchToThisWindow(hwnd, true);
      SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
      keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
      SetForegroundWindow(hwnd);
      SetActiveWindow(hwnd);
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

      if (attachedHwnd) AttachThreadInput(thisThread, hwndThread, false);
      if (attachedFg) AttachThreadInput(thisThread, fgThread, false);

      bool ok = GetForegroundWindow() == hwnd;
      if (ok) SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
      return ok;
    }

    public static void Select(string path) {
      IntPtr pidl = ILCreateFromPathW(path);
      if (pidl == IntPtr.Zero) return;
      try { SHOpenFolderAndSelectItems(pidl, 0, IntPtr.Zero, 0); }
      finally { ILFree(pidl); }
    }
  }
}
'@

$dll = Join-Path $env:TEMP 'grok-build-web-reveal-v5.dll'
if (-not (Test-Path -LiteralPath $dll)) {
  Add-Type -TypeDefinition $code -Language CSharp -OutputAssembly $dll
}
if (-not ([System.Management.Automation.PSTypeName]'GrokBuildWeb.Native').Type) {
  Add-Type -Path $dll
}

function Get-Cabinets {
  $rows = @()
  $raw = [GrokBuildWeb.Native]::ListCabinets()
  foreach ($line in ($raw -split "`n")) {
    if (-not $line) { continue }
    $p = $line -split "`t"
    if ($p.Count -lt 3) { continue }
    $rows += [pscustomobject]@{
      Hwnd   = [IntPtr][int64]$p[0]
      Title  = $p[1]
      Iconic = $p[2] -eq '1'
      Cloaked = ($p.Count -gt 3 -and $p[3] -eq '1')
    }
  }
  return $rows
}

$folderNorm = $folder.TrimEnd('\')
$leaf = [System.IO.Path]::GetFileName($folderNorm)
$selectPath = if ($fileName) { Join-Path $folder $fileName } else { $folder }
$wantDesktop = [GrokBuildWeb.Native]::DesktopOf([GrokBuildWeb.Native]::Foreground())

$before = @{}
foreach ($c in Get-Cabinets) { $before[[int64]$c.Hwnd] = $true }

$wsh = New-Object -ComObject WScript.Shell
$focused = $false
$hwnd = [IntPtr]::Zero
$started = Get-Date
$deadline = $started.AddSeconds(5)

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 80
  $elapsed = ((Get-Date) - $started).TotalMilliseconds
  $cands = @()
  foreach ($c in Get-Cabinets) {
    $id = [int64]$c.Hwnd
    $isNew = -not $before.ContainsKey($id)
    $titleHit = $c.Title -and ($c.Title -ieq $leaf -or $c.Title -like "$leaf *")
    if ($isNew -or $titleHit) {
      $cands += $c
      continue
    }
    if ($elapsed -gt 500 -and ($c.Iconic -or $c.Cloaked) -and (
      -not $c.Title -or $c.Title -like '*Explorer*'
    )) {
      $cands += $c
    }
  }
  if ($cands.Count -eq 0) { continue }

  foreach ($c in $cands) {
    $hwnd = $c.Hwnd
    [GrokBuildWeb.Native]::MoveToDesktop($hwnd, $wantDesktop)
    [GrokBuildWeb.Native]::RestoreNormal($hwnd)
    [GrokBuildWeb.Native]::Select($selectPath)
    try { [void]$wsh.AppActivate($leaf) } catch {}
    $focused = [GrokBuildWeb.Native]::Focus($hwnd)
    if ($focused) { break }
  }
  if ($focused) { break }
}

if ($hwnd -ne [IntPtr]::Zero -and -not $focused) {
  [GrokBuildWeb.Native]::RestoreNormal($hwnd)
  [GrokBuildWeb.Native]::Focus($hwnd)
}
