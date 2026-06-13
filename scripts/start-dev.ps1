$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot

try {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd was not found. Install Node.js 20 or newer and reopen the terminal."
  }

  Write-Host "VoiceAssistant development launcher" -ForegroundColor Green
  Write-Host "[backend] Fastify API: http://127.0.0.1:8787" -ForegroundColor Cyan
  Write-Host "[desktop] Vite + Electron desktop application" -ForegroundColor Magenta
  Write-Host "Press Ctrl+C to stop both processes." -ForegroundColor DarkGray
  Write-Host ""

  & npm.cmd run dev:all
  if ($LASTEXITCODE -ne 0) {
    throw "VoiceAssistant development processes exited with code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
