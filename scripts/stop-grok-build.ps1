# Stops the background Grok Build web console started by open-grok-build.ps1.
# Double-click scripts\stop-grok-build.cmd (a .ps1 does not run on double-click).
$ErrorActionPreference = 'Stop'
$Port = 5173

function Show-Notice([string]$Text, [int]$Icon = 64) {
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($Text, 0, 'Grok Build', $Icon)
}

function Get-ListenPids([int]$Port) {
  try {
    return @(
      Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  } catch {
    $found = @()
    foreach ($line in (netstat -ano)) {
      if ($line -match "TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)") {
        $found += [int]$Matches[1]
      }
    }
    return @($found | Select-Object -Unique)
  }
}

function Get-LegacyNote {
  # Older builds spawned a visible "Grok Build" cmd window. Report it, never kill it:
  # a window started that way can still be serving the port, and its whole tree
  # would go down with it.
  $ids = @(
    Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -like '*title Grok Build*' } |
      Select-Object -ExpandProperty ProcessId
  )
  if (-not $ids) { return '' }
  return "`n`n另有一个旧的 Grok Build 命令行窗口还开着（PID $($ids -join ', ')），关掉它即可。"
}

$pids = Get-ListenPids $Port
$killed = @()

foreach ($procId in $pids) {
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $proc) { continue }
  if ($proc.ProcessName -ne 'node') {
    Show-Notice "端口 $Port 被 $($proc.ProcessName).exe（PID $procId）占用，不是 Grok Build 服务，未做处理。" 48
    exit 1
  }
  taskkill /PID $procId /T /F 2>&1 | Out-Null
  $killed += $procId
}

$legacyNote = Get-LegacyNote

if (-not $killed) {
  Show-Notice ("本机服务未在运行（端口 $Port 空闲）。" + $legacyNote) 64
  exit 0
}

$deadline = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $deadline -and (Get-ListenPids $Port)) {
  Start-Sleep -Milliseconds 250
}

if (Get-ListenPids $Port) {
  Show-Notice "已发出停止指令，但端口 $Port 仍在监听。请在任务管理器结束 node.exe，或重启电脑。" 48
  exit 1
}

Show-Notice ("已停止 Grok Build 服务（端口 $Port）。再开桌面快捷方式即可重新启动。" + $legacyNote) 64
exit 0
