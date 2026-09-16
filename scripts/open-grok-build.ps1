# Starts the local Grok Build web console and opens the browser.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Url = 'http://localhost:5173/'
$Port = 5173

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

if (-not (Test-Listen)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    Show-Notice "找不到 npm。请先安装 Node.js，并确认已在本机跑通过 npm run dev。`n$Root" 16
    exit 1
  }
  Start-Process -FilePath $env:ComSpec -WorkingDirectory $Root -ArgumentList @(
    '/k',
    'title Grok Build && npm run dev'
  ) | Out-Null
}

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-Http) {
    Start-Process $Url
    exit 0
  }
  Start-Sleep -Milliseconds 350
}

Show-Notice "服务启动超时。请看名为 Grok Build 的命令行窗口是否报错，或手动打开 $Url" 48
Start-Process $Url
exit 1
