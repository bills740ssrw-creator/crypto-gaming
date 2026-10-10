#!/usr/bin/env pwsh
# Builds a static export of ONLY the marketing landing page for GitHub Pages.
# The NextAuth API route and dashboard pages need a backend, so they are
# temporarily moved out of the way during the export, then restored.
#
# Output: packages/frontend/out  ->  copied to /docs for GitHub Pages

$ErrorActionPreference = "Stop"
$fe = "C:\Users\Deepanshu\packages\frontend"
$apiRoute = "$fe\src\app\api"
$stash = "$fe\.export-stash"

Write-Host "==> Stashing backend-only routes" -ForegroundColor Cyan
if (Test-Path $stash) { Remove-Item -Recurse -Force $stash }
New-Item -ItemType Directory -Path $stash | Out-Null
if (Test-Path $apiRoute) { Move-Item $apiRoute "$stash\api" }

try {
  Write-Host "==> Building static export" -ForegroundColor Cyan
  $env:STATIC_EXPORT = "1"
  $env:BASE_PATH = "/crypto-gaming"
  Push-Location $fe
  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "static export build failed" }

  Write-Host "==> Copying export to /docs" -ForegroundColor Cyan
  $docs = "C:\Users\Deepanshu\docs"
  if (Test-Path $docs) { Remove-Item -Recurse -Force $docs }
  Copy-Item "$fe\out" $docs -Recurse

  # GitHub Pages 404 fallback -> serve the landing page
  Copy-Item "$docs\index.html" "$docs\404.html" -Force

  Write-Host "==> Done. Static site in /docs" -ForegroundColor Green
}
finally {
  Pop-Location
  Write-Host "==> Restoring backend-only routes" -ForegroundColor Cyan
  if (Test-Path "$stash\api") { Move-Item "$stash\api" $apiRoute -Force }
  Remove-Item -Recurse -Force $stash -ErrorAction SilentlyContinue
  Remove-Item Env:\STATIC_EXPORT -ErrorAction SilentlyContinue
  Remove-Item Env:\BASE_PATH -ErrorAction SilentlyContinue
}
