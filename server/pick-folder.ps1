$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择项目文件夹'
$dialog.Filter = '文件夹|*.none'
$dialog.CheckFileExists = $false
$dialog.CheckPathExists = $true
$dialog.ValidateNames = $false
$dialog.FileName = '选择文件夹'
$start = [string]$env:GROK_PICK_START
if ($start -and (Test-Path -LiteralPath $start -PathType Container)) {
  $dialog.InitialDirectory = $start
}
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'FixedToolWindow'
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0.01
[void]$owner.Show()
$owner.Activate()
$result = $dialog.ShowDialog($owner)
$owner.Close()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 2 }
$picked = [System.IO.Path]::GetDirectoryName($dialog.FileName)
if (-not $picked) { exit 2 }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $picked
