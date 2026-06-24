$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot

try {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd was not found. Install Node.js 20 or newer and reopen the terminal."
  }

  Write-Host "=== VoiceAssistant port check ===" -ForegroundColor Green
  & "$PSScriptRoot\check-ports.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "Port check failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "=== Local knowledge regression suite ===" -ForegroundColor Green
  & npm.cmd run test:knowledge
  if ($LASTEXITCODE -ne 0) {
    throw "Local knowledge regression suite failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "=== Development launcher policy tests ===" -ForegroundColor Green
  & npm.cmd run test:launcher
  if ($LASTEXITCODE -ne 0) {
    throw "Development launcher policy tests failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "=== Backend tests ===" -ForegroundColor Green
  & npm.cmd run test:backend
  if ($LASTEXITCODE -ne 0) {
    throw "Backend tests failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "=== Production build ===" -ForegroundColor Green
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "VoiceAssistant verification passed." -ForegroundColor Green
} catch {
  Write-Error $_
  exit 1
} finally {
  Pop-Location
}
