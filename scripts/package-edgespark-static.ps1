param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $root $OutDir
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "edgespark-static-$stamp"
$packageDir = Join-Path $distRoot $packageName
$zipPath = Join-Path $distRoot "$packageName.zip"

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $packageDir "h5") | Out-Null

Get-ChildItem -Path (Join-Path $root "h5") -File |
  Where-Object { $_.Name -ne "server.js" } |
  Copy-Item -Destination (Join-Path $packageDir "h5") -Force
Copy-Item -Path (Join-Path $root "assets") -Destination $packageDir -Recurse -Force

$readme = @(
  "# Xiabi Youyuan H5 static package",
  "",
  "Generated at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "",
  "## Entries",
  "",
  "- User H5: /h5/index.html",
  "- H5 admin: /h5/admin.html",
  "",
  "## Notes",
  "",
  "- This package only contains static H5 pages, mock admin pages, and image assets.",
  "- Mock config and user state use same-origin localStorage.",
  "- Do not put model keys, voice keys, or payment secrets in frontend files.",
  "- Deploy the package root so /h5/index.html and /assets/ui/*.png are directly accessible."
) -join [Environment]::NewLine

Set-Content -Path (Join-Path $packageDir "DEPLOY_README.md") -Value $readme -Encoding UTF8

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Package directory: $packageDir"
Write-Host "Package zip: $zipPath"
