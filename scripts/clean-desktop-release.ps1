$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $repositoryRoot "apps\desktop\release"

if (Test-Path $releaseDirectory) {
  Write-Host "Removing stale desktop release output: $releaseDirectory"
  Remove-Item -LiteralPath $releaseDirectory -Recurse -Force
} else {
  Write-Host "Desktop release output is already clean."
}
