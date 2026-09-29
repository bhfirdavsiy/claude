$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$out = Join-Path $root 'browser-evidence'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

$reportsOut = Join-Path $out 'reports'
New-Item -ItemType Directory -Path $reportsOut -Force | Out-Null
$files = @(
  'browser-gates.json',
  'production-build.json',
  'stable-preflight.json',
  'stable-signoff-targets.json',
  'external-provider-readiness.json',
  'external-lab-integration.json'
)
foreach ($name in $files) {
  $src = Join-Path $root ('reports\' + $name)
  if (Test-Path $src) { Copy-Item $src (Join-Path $reportsOut $name) -Force }
}
$visual = Join-Path $root 'reports\visual-regression\phase12-smoke'
$visualOut = Join-Path $reportsOut 'visual-regression\phase12-smoke'
if (Test-Path $visual) { New-Item -ItemType Directory -Path (Split-Path $visualOut) -Force | Out-Null; Copy-Item $visual $visualOut -Recurse -Force }
$meta = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  machine = $env:COMPUTERNAME
  node = (& node -v)
  note = 'Evidence only. Browser PASS does not replace CHEM-033, PROD-002, Beta or visual human approvals.'
}
$meta | ConvertTo-Json | Set-Content (Join-Path $out 'evidence-meta.json') -Encoding UTF8
$zip = Join-Path $root 'KimyoLab_v20_Browser_Evidence.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zip -Force
Write-Host "Evidence: $out"
Write-Host "ZIP: $zip"
