# Builds Grok-Build-Setup-<version>.exe into release/.
# Needs Node 20+ and NSIS (makensis) on PATH.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

node .\scripts\stage-win.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pkg = Get-Content .\package.json -Raw | ConvertFrom-Json
$version = $pkg.version
$stage = Join-Path $Root 'release\win-unpacked'
$out = Join-Path $Root 'release'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$makensis = Get-Command makensis -ErrorAction SilentlyContinue
if (-not $makensis) {
  Write-Error '找不到 makensis。请先安装 NSIS 并把它加进 PATH。'
}

& makensis "/DVERSION=$version" "/DSTAGE=$stage" "/DOUT=$out" .\scripts\installer.nsi
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "release\Grok-Build-Setup-$version.exe"
