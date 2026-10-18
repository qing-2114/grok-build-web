# Starts the local Grok Build desktop window.
# The server runs with NO console window (CreateNoWindow), so Windows Terminal
# never opens a tab for it. Output goes to %LOCALAPPDATA%\grok-build-web\desktop.log.
# Closing the window stops the server. scripts\stop-grok-build.cmd stops a leftover.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$MutexName = 'Local\GrokBuildWebDesktopLaunch'
$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$owned = $false
try {
  $owned = $mutex.WaitOne(0, $false)
} catch [System.Threading.AbandonedMutexException] {
  $owned = $true
}
if (-not $owned) { exit 0 }
$script:LaunchCode = 0
try {
if ($env:LOCALAPPDATA) {
  $LogDir = Join-Path $env:LOCALAPPDATA 'grok-build-web'
} else {
  $LogDir = Join-Path $env:TEMP 'grok-build-web'
}
$Log = Join-Path $LogDir 'desktop.log'
$PidFile = Join-Path $LogDir 'desktop.pid'

function Show-Notice([string]$Text, [int]$Icon = 64) {
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($Text, 0, 'Grok Build', $Icon)
}

function New-LogPath([string]$Preferred) {
  # Fresh log per launch. If the old one is locked by a zombie server, fall back
  # to a timestamped name instead of failing the redirect.
  if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  }
  try { Remove-Item -LiteralPath $Preferred -Force -ErrorAction Stop } catch { }
  if (Test-Path -LiteralPath $Preferred) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $name = [System.IO.Path]::GetFileNameWithoutExtension($Preferred)
    return Join-Path $LogDir ("{0}-{1}.log" -f $name, $stamp)
  }
  return $Preferred
}

function Start-Hidden([string]$Arguments, [string]$LogPath) {
  $comspec = $env:ComSpec
  if (-not $comspec) { $comspec = Join-Path $env:SystemRoot 'System32\cmd.exe' }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $comspec
  # /c (not /k): the child exits on its own, nothing is left holding an open window.
  # Do not start the /c text with a quote. cmd.exe then strips the first and last
  # quote on the line, the node command never starts, and the shortcut looks dead.
  $psi.Arguments = '/c cd /d "' + $Root + '" && ' + $Arguments + ' > "' + $LogPath + '" 2>&1'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $id = $proc.Id
  $proc.Dispose()
  return $id
}

function Get-LogTail([string]$Path, [int]$Lines = 12) {
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  try {
    return ((Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop) -join "`r`n")
  } catch {
    return ''
  }
}

function Test-AppServing {
  $req = $null
  $resp = $null
  $reader = $null
  try {
    $req = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:5173/api/status')
    $req.Timeout = 1500
    $req.ReadWriteTimeout = 1500
    $req.Method = 'GET'
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $reader.ReadToEnd()
    return $body -match '"connected"'
  } catch {
    return $false
  } finally {
    if ($reader) { $reader.Dispose() }
    if ($resp) { $resp.Close() }
  }
}

function Test-PortOpen {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect('127.0.0.1', 5173, $null, $null)
    if (-not $wait.AsyncWaitHandle.WaitOne(800, $false)) { return $false }
    $client.EndConnect($wait)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-PortOwner {
  $procId = 0
  try {
    $procId = [int](
      Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -First 1
    )
  } catch {
    foreach ($line in (netstat -ano)) {
      if ($line -match 'TCP\s+\S+:5173\s+\S+\s+LISTENING\s+(\d+)') {
        $procId = [int]$Matches[1]
        break
      }
    }
  }
  if ($procId -le 0) { return '' }
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $proc) { return "占用进程 PID $procId。" }
  return "占用进程：$($proc.ProcessName).exe（PID $procId）。"
}

function Get-ElectronExe {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node.Source
  $psi.Arguments = '-e "process.stdout.write(require(''electron''))"'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
  $proc = [System.Diagnostics.Process]::Start($psi)
  $path = $proc.StandardOutput.ReadToEnd().Trim()
  $proc.WaitForExit()
  $proc.Dispose()
  if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  return $null
}

function Start-AppWindow {
  $exe = Get-ElectronExe
  if (-not $exe) {
    Show-Notice "找不到应用窗口程序。请先在仓库根目录运行 npm install。`n$Root" 16
    $script:LaunchCode = 1
    return
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $main = Join-Path $Root 'electron\main.cjs'
  $psi.Arguments = '"' + $main + '"'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  if ($psi.EnvironmentVariables.ContainsKey('ELECTRON_RUN_AS_NODE')) {
    $psi.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
  }
  $psi.EnvironmentVariables['GROK_WEB_URL'] = 'http://127.0.0.1:5173/'
  $psi.EnvironmentVariables['GROK_WEB_ICON'] = (Join-Path $Root 'public\grok-icon.ico')
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.Dispose()
}

function Test-DesktopRunning {
  if (-not (Test-Path -LiteralPath $PidFile)) { return $false }
  $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $procId = 0
  if (-not [int]::TryParse([string]$raw, [ref]$procId)) { return $false }
  return $null -ne (Get-Process -Id $procId -ErrorAction SilentlyContinue)
}

function Focus-DesktopWindow {
  $sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GrokBuildFocus {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public static bool Focus() {
    bool found = false;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, sb.Capacity);
      var title = sb.ToString();
      if (title.IndexOf("Grok Build", StringComparison.OrdinalIgnoreCase) < 0) return true;
      ShowWindow(hWnd, 9);
      SetForegroundWindow(hWnd);
      found = true;
      return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
  try {
    Add-Type -TypeDefinition $sig -ErrorAction Stop
  } catch {
    # already loaded in this process
  }
  return [GrokBuildFocus]::Focus()
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
if (-not $node) {
  Show-Notice "找不到 Node.js。请先安装 Node.js 20 或更高版本。`n$Root" 16
  $script:LaunchCode = 1
  return
}

if (Test-DesktopRunning) {
  if (Focus-DesktopWindow) { return }
  if (Test-AppServing) {
    Start-AppWindow
    return
  }
  Show-Notice "Grok Build 已经在运行。任务栏里点开它即可。" 64
  return
}

# 5173 上已经是这个工作台（开发服务，或窗口丢了但服务还在）时，
# 不再绑第二次端口，直接把应用窗口打开。
if (Test-AppServing) {
  Start-AppWindow
  return
}
if (Test-PortOpen) {
  $who = Get-PortOwner
  $text = "端口 5173 已被占用，桌面窗口无法打开。"
  if ($who) { $text += "`n$who" }
  $text += "`n可先运行 scripts\stop-grok-build.cmd，再打开快捷方式。"
  Show-Notice $text 48
  $script:LaunchCode = 1
  return
}

$index = Join-Path $Root 'dist\index.html'
if (-not (Test-Path -LiteralPath $index)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    Show-Notice "找不到构建产物，也找不到 npm。请先在仓库里运行 npm run build。`n$Root" 16
    $script:LaunchCode = 1
    return
  }
  $buildLog = New-LogPath (Join-Path $LogDir 'build.log')
  Show-Notice "第一次打开需要构建界面，完成前请稍等。" 64
  $buildId = Start-Hidden 'npm run build' $buildLog
  $build = Get-Process -Id $buildId -ErrorAction SilentlyContinue
  if ($build) { $build.WaitForExit() }
  if (-not (Test-Path -LiteralPath $index)) {
    $tail = Get-LogTail $buildLog
    $text = "构建失败。日志：`n$buildLog"
    if ($tail) { $text += "`n`n$tail" }
    Show-Notice $text 16
    $script:LaunchCode = 1
    return
  }
}

$launchLog = New-LogPath $Log
$tsx = Join-Path $Root 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path -LiteralPath $tsx)) {
  Show-Notice "缺少依赖。请先在仓库根目录运行 npm install。`n$Root" 16
  $script:LaunchCode = 1
  return
}

$launchId = Start-Hidden ('"' + $node.Source + '" "' + $tsx + '" server/desktop.ts') $launchLog

$deadline = (Get-Date).AddSeconds(25)
$ready = $false
while ((Get-Date) -lt $deadline) {
  $text = Get-LogTail $launchLog 40
  if ($text -match 'Grok Build desktop http://') {
    $ready = $true
    break
  }
  if ($text -match '找不到应用窗口|缺少构建产物|EADDRINUSE|端口 5173 已被占用') { break }
  $cmd = Get-Process -Id $launchId -ErrorAction SilentlyContinue
  if (-not $cmd -and -not (Test-DesktopRunning) -and $text) { break }
  Start-Sleep -Milliseconds 250
}
if (-not $ready -and (Test-AppServing)) {
  if (-not (Focus-DesktopWindow)) { Start-AppWindow }
  $ready = $true
}

if (-not $ready) {
  $tail = Get-LogTail $launchLog
  $text = "桌面窗口没有打开。日志：`n$launchLog"
  if ($tail) { $text += "`n`n$tail" }
  Set-Content -LiteralPath (Join-Path $LogDir 'launch-error.txt') -Value $text -Encoding utf8
  Show-Notice $text 48
  $script:LaunchCode = 1
}
} finally {
  if ($owned) {
    try { $mutex.ReleaseMutex() } catch { }
  }
  $mutex.Dispose()
}
exit $script:LaunchCode
