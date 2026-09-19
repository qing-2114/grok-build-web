# Starts the local Grok Build web console and opens the browser.
# The dev server runs with NO console window (CreateNoWindow), so Windows Terminal
# never opens a tab for it. Output goes to %LOCALAPPDATA%\grok-build-web\dev.log.
# Stop it with scripts\stop-grok-build.cmd (or scripts\stop-grok-build.ps1).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Url = 'http://127.0.0.1:5173/'
$Port = 5173
if ($env:LOCALAPPDATA) {
  $LogDir = Join-Path $env:LOCALAPPDATA 'grok-build-web'
} else {
  $LogDir = Join-Path $env:TEMP 'grok-build-web'
}
$Log = Join-Path $LogDir 'dev.log'

function Show-Notice([string]$Text, [int]$Icon = 64) {
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($Text, 0, 'Grok Build', $Icon)
}

function Test-Listen {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $client.ReceiveTimeout = 500
    $client.SendTimeout = 500
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400, $false)
    if ($ok -and $client.Connected) {
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Test-Http {
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = 'GET'
    $req.Timeout = 1500
    $req.ReadWriteTimeout = 1500
    $req.AllowAutoRedirect = $false
    $resp = $req.GetResponse()
    $resp.Close()
    return $true
  } catch {
    return $false
  }
}

function New-LogPath {
  # Fresh log per launch. If the old one is locked by a zombie server, fall back
  # to a timestamped name instead of failing the redirect.
  if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  }
  try { Remove-Item -LiteralPath $Log -Force -ErrorAction Stop } catch { }
  if (Test-Path -LiteralPath $Log) {
    return Join-Path $LogDir ('dev-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  }
  return $Log
}

function Start-DevServer([string]$LogPath) {
  $comspec = $env:ComSpec
  if (-not $comspec) { $comspec = Join-Path $env:SystemRoot 'System32\cmd.exe' }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $comspec
  # /c (not /k): npm exits on its own, nothing is left holding an open window.
  $psi.Arguments = '/c npm run dev > "' + $LogPath + '" 2>&1'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.Dispose()
}

function Get-LogTail([string]$Path, [int]$Lines = 12) {
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  try {
    return ((Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop) -join "`r`n")
  } catch {
    return ''
  }
}

if (-not (Test-Listen)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    Show-Notice "找不到 npm。请先安装 Node.js，并确认已在本机跑通过 npm run dev。`n$Root" 16
    exit 1
  }
  $launchLog = New-LogPath
  Start-DevServer $launchLog
  $started = $true
} else {
  $launchLog = $Log
  $started = $false
}

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-Http) {
    Start-Process $Url
    exit 0
  }
  Start-Sleep -Milliseconds 350
}

if ($started) {
  $tail = Get-LogTail $launchLog
  $text = "服务启动超时。日志：`n$launchLog"
  if ($tail) { $text += "`n`n$tail" }
} else {
  $text = "端口 $Port 已被占用，但页面打不开（可能不是 Grok Build 服务，或它卡住了）。`n先跑 scripts\stop-grok-build.cmd 再重试。"
}
Show-Notice $text 48
Start-Process $Url
exit 1
